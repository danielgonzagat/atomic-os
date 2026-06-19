/**
 * symbol-closure.ts — Per-Symbol Closure Provider
 *
 * Narrows the algebra's closure from per-FILE to per-SYMBOL granularity.
 *
 * CURRENT (per-file): closureOf('fileA.ts') = Set{fileA.ts, fileB.ts, ..., imports...}
 *   → any edit on fileA couples with any edit on fileA or its imports
 *   → OVER-APPROXIMATION: safe but yields false conflicts
 *
 * PROPOSED (per-symbol): resolutionFor('fileA.ts', spans) = Set{symbol:foo@fileA, symbol:bar@fileB}
 *   → two edits on DIFFERENT symbols in the SAME file DO NOT couple
 *   → STRICTLY TIGHTER → more confluent throughput
 *
 * The provider is injectable via the ClosureProvider type in algebra.ts.
 * It can be used as a drop-in replacement in commute() for any edit that
 * carries spanIdents (identifiers hit by the edit spans).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { closureOf, resolveImport } from './algebra.js';

// ── Types ──────────────────────────────────────────────────────────

/** A fully-qualified symbol: name + file. */
export interface SymbolLocus {
  name: string;
  file: string;
}

/** Resolution result for an edit site. */
export interface Resolution {
  /** symbols this edit READS (must not overlap with another edit's WRITES for confluence) */
  reads: Set<string>;
  /** symbols this edit WRITES (may not matter for obligation preservation if read-set is disjoint) */
  writes: Set<string>;
  /** whether this resolution is capped (capped = lower bound = safe but conservative) */
  capped: boolean;
}

// ── Identifiers from spans ─────────────────────────────────────────

/**
 * Extract identifier-like tokens from text spans.
 * Uses regex-based extraction (fast, portable, no WASM needed).
 * For tighter resolution, tree-sitter would be used; regex is a sound
 * OVER-approximation (more identifiers = larger closure = safe but conservative).
 *
 * @param content - file content
 * @param spans - [start, end] byte ranges
 * @returns set of identifier strings found in the given spans
 */
export function identifiersInSpans(content: string, spans: [number, number][]): Set<string> {
  const ids = new Set<string>();
  const idRe = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;

  for (const [start, end] of spans) {
    const slice = content.slice(start, end);
    let m: RegExpExecArray | null;
    idRe.lastIndex = 0;
    while ((m = idRe.exec(slice)) !== null) {
      const name = m[0];
      // Skip keywords and single-char identifiers (likely noise)
      if (name.length > 1 && !isKeyword(name)) {
        ids.add(name);
      }
    }
  }
  return ids;
}

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof',
  'instanceof', 'void', 'this', 'super', 'class', 'function', 'const', 'let',
  'var', 'import', 'export', 'default', 'from', 'as', 'async', 'await',
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'in', 'of',
  'public', 'private', 'protected', 'static', 'readonly', 'abstract',
  'extends', 'implements', 'interface', 'type', 'enum', 'namespace',
  'yield', 'with', 'debugger', 'get', 'set', 'constructor',
]);

function isKeyword(s: string): boolean {
  return KEYWORDS.has(s);
}

// ── Resolution ─────────────────────────────────────────────────────

/**
 * Narrow a file-level closure to a symbol-level resolution.
 *
 * Given:
 *   - repoRoot: repository path
 *   - file: the file being edited (repo-relative)
 *   - spans: byte ranges of the edit
 *   - content: optional file content (read from disk if not provided)
 *
 * Returns a Resolution whose `reads` set is a TIGHTER bound than the
 * file-level closure. The reads set contains string keys of the form
 * `name@file` (e.g., "greet@src/handler.ts").
 *
 * Algorithm:
 *   1. Extract identifiers from the edit spans
 *   2. For each identifier, check if it's DEFINED in the same file
 *      (local → no cross-file coupling)
 *   3. For external identifiers, resolve through the import graph
 *      using the file-level closure narrowed to only the symbols used
 *   4. If resolution is incomplete (capped), fall back to file-level closure
 *      for the unresolved portion (safe direction)
 */
export function resolveSymbols(
  repoRoot: string,
  file: string,
  spans: [number, number][],
  content?: string,
): Resolution {
  const txt = content ?? readFile(repoRoot, file);
  if (txt === null) {
    // Can't read file → fall back to file-level (safe)
    return fileLevelResolution(file);
  }

  const spanIds = identifiersInSpans(txt, spans);
  const reads = new Set<string>();
  const writes = new Set<string>();

  // Get file-level closure as safety net
  const fileClosure = closureOf(repoRoot, file);
  const closureFiles = [...fileClosure.set];

  // Step 1: resolve locally-defined identifiers (no cross-file coupling)
  const localDefs = extractDefinedIdentifiers(txt);

  for (const id of spanIds) {
    if (localDefs.has(id)) {
      // Local symbol → only couples with edits on THIS file's same symbol
      reads.add(`${id}@${file}`);
    } else {
      // External symbol → needs import resolution
      // Search closure files for where this symbol is defined
      let resolved = false;
      for (const cf of closureFiles) {
        const cfContent = readFile(repoRoot, cf);
        if (cfContent && isIdentifierDefined(cfContent, id)) {
          reads.add(`${id}@${cf}`);
          resolved = true;
          break;
        }
      }
      if (!resolved) {
        // Can't resolve → fall back to file-level for safety
        reads.add(`*@${file}`);
      }
    }
  }

  // Mark edited symbols as writes
  for (const id of spanIds) {
    writes.add(`${id}@${file}`);
  }

  return {
    reads,
    writes,
    capped: reads.has(`*@${file}`), // capped if any symbol couldn't be resolved
  };
}

// ── Identifier extraction from file content ────────────────────────

/**
 * Extract top-level identifiers DEFINED in a file.
 * Uses regex for speed; tree-sitter would give tighter results.
 */
function extractDefinedIdentifiers(content: string): Set<string> {
  const defs = new Set<string>();
  // Match: function/const/let/var/class/interface/type/enum NAME
  const defRe = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = defRe.exec(content)) !== null) {
    defs.add(m[1]!);
  }
  // Also match: module.exports.NAME = ..., exports.NAME = ...
  const exportsRe = /(?:module\.exports\.|exports\.)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  while ((m = exportsRe.exec(content)) !== null) {
    defs.add(m[1]!);
  }
  return defs;
}

/**
 * Check if a file defines a specific identifier.
 */
function isIdentifierDefined(content: string, name: string): boolean {
  const defs = extractDefinedIdentifiers(content);
  return defs.has(name);
}

// ── Helpers ─────────────────────────────────────────────────────────

function readFile(repoRoot: string, rel: string): string | null {
  try {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return fs.readFileSync(abs, 'utf8');
    }
  } catch {
    /* unreadable */
  }
  return null;
}

function fileLevelResolution(file: string): Resolution {
  return {
    reads: new Set([`*@${file}`]),
    writes: new Set([`*@${file}`]),
    capped: true,
  };
}

// ── ClosureProvider adapter ─────────────────────────────────────────

/**
 * Create a per-symbol ClosureProvider that can be injected into commute().
 *
 * This adapter converts the symbol-level Resolution into the Set<string>
 * format expected by ClosureProvider:
 *   - Each entry is "symbol@file"
 *   - The commute() function checks if closures INTERSECT
 *   - Per-symbol closures have STRICTLY FEWER intersections than per-file
 *
 * @param repoRoot - repository root
 * @param file - repo-relative file path
 * @param spans - byte ranges of the edit (pass [] for file-level fallback)
 * @param content - optional file content (avoids re-reading)
 */
export function perSymbolClosureProvider(
  repoRoot: string,
  file: string,
  spans: [number, number][],
  content?: string,
): { set: Set<string>; capped: boolean } {
  const resolution = resolveSymbols(repoRoot, file, spans, content);
  return {
    set: resolution.reads,
    capped: resolution.capped,
  };
}

/**
 * Compute the reduction factor: per-file closure size / per-symbol closure size.
 * Values > 1 indicate how many fewer false couplings per-symbol resolution achieves.
 */
export function closureReductionFactor(
  repoRoot: string,
  file: string,
  spans: [number, number][],
  content?: string,
): number {
  const fileClosure = closureOf(repoRoot, file);
  const symbolClosure = resolveSymbols(repoRoot, file, spans, content);

  if (fileClosure.set.size === 0) return 1;
  return fileClosure.set.size / Math.max(1, symbolClosure.reads.size);
}
