/**
 * connection-gate.ts — the exoneration-free CONNECTION fact, at the byte floor.
 *
 * A relative import resolves to a real file, or it dangles. That is a FACT, not a
 * heuristic — no language server, no gate config, no guessing, no language bias.
 * This module is the single source of that truth, consumed by BOTH the static
 * convergence engine (overlay-aware, pre-write) and the byte-write floor in
 * server-helpers-io (disk + pending-set aware, AT write). Pure fs+path: zero
 * heavy deps, so the leaf io module can import it without pulling the tree-sitter
 * engine into every write.
 *
 * Semantics (universal, works on any repo with or without gates):
 *  - Only SOURCE files are judged (.ts/.tsx/.js/.jsx/.mjs/.cjs). Everything else
 *    (json, locks, traces, css) has no relative-import fact to assert → green.
 *  - Only NEW wires are this write's claim: a specifier present in the new content
 *    but NOT in the file's prior content. A pre-existing dangling import in a
 *    legacy file never blocks an unrelated edit — but no write may INTRODUCE one.
 *  - Bare specifiers (packages/builtins) are out of scope: not a dangling-wire
 *    fact we can assert from the filesystem alone.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isBuiltin } from 'node:module';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|c|cc|cpp)$/;

// The node_modules supply-chain fact (a bare specifier resolves to an installed
// `node_modules/<pkg>/package.json`, with `isBuiltin` covering Node core) is
// MEANINGFUL ONLY for JS/TS. Go stdlib (`strings`, `fmt`), Rust crates
// (`std`/Cargo), Python site-packages, Java classpath, and C/C++ includes never
// resolve through node_modules, so judging their bare imports by this fact
// falsely reddens every NEW standard-library import and refuses the write. The
// async supply-chain-gate.ts restricts to exactly this JS/TS set for the same
// reason; the sync byte-floor twin below must match it (the relative half —
// checkConnectionByteFloor — stays multi-language because sibling-file
// resolution IS cross-language).
const JS_SUPPLY_CHAIN_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Files about to exist within the current multi-file atomic transaction. The
 * byte-floor gate consults this so a pre-approved set that wires A→B (e.g.
 * atomic_converge creating B and importing it from A) is not false-reddened by
 * the order the firewall happens to write them. Single-file writes leave it empty.
 */
const pending = new Set<string>();
export function registerPendingWrites(absPaths: string[]): void {
  for (const p of absPaths) pending.add(path.resolve(p));
}
export function clearPendingWrites(): void {
  pending.clear();
}
/**
 * Count of files currently registered as pending in the active multi-file atomic
 * set (0 when no transaction is in flight). The byte-floor type-soundness gate
 * consults this: a per-file in-memory compile cannot see the sibling candidates of
 * a multi-file A→B set (only their disk bytes), so when a multi-file set is in
 * flight it bails UNJUDGED at the floor and defers to convergeStatic, which type-
 * checks the full overlay. Single-file writes (count ≤ 1) type-check fully here.
 */
export function pendingWriteCount(): number {
  return pending.size;
}

/**
 * Length-preserving blanking of //, /* * / and # comments ONLY (never string literals).
 * String literals are SKIPPED OVER (preserved) so a `//` inside a URL string is not
 * mistaken for a comment. This removes comment-embedded false matches like a
 * `from './x'` written in a doc comment. Supports both JS/TS/C/Go (//) and
 * Python/Ruby/Shell (#) comment styles generically.
 */
export function blankComments(text: string): string {
  const out = text.split('');
  const n = text.length;
  let i = 0;
  const blankTo = (end: number): void => {
    for (let k = i; k < end && k < n; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    if (c === '/' && c2 === '/') {
      let j = i + 2;
      while (j < n && text[j] !== '\n') j += 1;
      blankTo(j);
      i = j;
    } else if (c === '/' && c2 === '*') {
      let j = i + 2;
      while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j += 1;
      j = Math.min(j + 2, n);
      blankTo(j);
      i = j;
    } else if (c === '#') {
      let j = i + 1;
      while (j < n && text[j] !== '\n') j += 1;
      blankTo(j);
      i = j;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1; // skip OVER the string (preserve it — specifiers live here)
      while (j < n && text[j] !== c) {
        if (text[j] === '\\') j += 1;
        j += 1;
      }
      i = Math.min(j + 1, n);
    } else {
      i += 1;
    }
  }
  return out.join('');
}

export function extractImportSpecifiers(content: string): string[] {
  const code = blankComments(content);
  const specs: string[] = [];
  // JS/TS: from '...', require('...'), import '...'
  const jsRe = /\bfrom\s+['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = jsRe.exec(code)) !== null) specs.push(m[1] ?? m[2] ?? m[3]);
  
  // Python: from .foo import, import .foo (relative dots)
  const pyRe = /^\s*(?:from|import)\s+([.][a-zA-Z0-9_.]+)/gm;
  while ((m = pyRe.exec(code)) !== null) specs.push(m[1]);

  // Go/C/Generic: import "..." or #include "..."
  const genRe = /\b(?:import|include)\s+['"]([^'"]+)['"]/gm;
  while ((m = genRe.exec(code)) !== null) {
    if (!specs.includes(m[1])) specs.push(m[1]);
  }

  return specs;
}

function candidatesFor(baseAbs: string): string[] {
  const c = [
    baseAbs,
    `${baseAbs}.ts`, `${baseAbs}.tsx`, `${baseAbs}.js`, `${baseAbs}.jsx`,
    `${baseAbs}.mjs`, `${baseAbs}.cjs`, `${baseAbs}.json`,
    `${baseAbs}.py`, `${baseAbs}.go`, `${baseAbs}.rb`, `${baseAbs}.rs`,
    `${baseAbs}.java`, `${baseAbs}.c`, `${baseAbs}.h`, `${baseAbs}.cc`, `${baseAbs}.cpp`,
    path.join(baseAbs, 'index.ts'), path.join(baseAbs, 'index.tsx'), path.join(baseAbs, 'index.js'),
    path.join(baseAbs, '__init__.py'),
  ];
  if (baseAbs.endsWith('.js')) c.push(`${baseAbs.slice(0, -3)}.ts`, `${baseAbs.slice(0, -3)}.tsx`);
  return c;
}

/** Resolve a RELATIVE specifier against dirname(fromAbs), consulting pending+disk. */
function relativeImportResolvesAbs(fromAbs: string, spec: string): boolean {
  if (!spec.startsWith('.')) return true; // bare specifier → package/builtin → not judged
  const baseAbs = path.resolve(path.dirname(fromAbs), spec);
  return candidatesFor(baseAbs).some((cand) => {
    const r = path.resolve(cand);
    return pending.has(r) || fs.existsSync(cand);
  });
}

/**
 * Resolve a KLOEL `@/...` path alias using the `<pkg>/src/` convention derived from the
 * importing file's absolute path — I/O-free beyond the existing candidate existsSync probe
 * (NO tsconfig read on the byte floor). The repo maps `@/*` → `<frontend|backend|worker>/src/*`.
 * Returns: true (resolves), false (the package-src root is locatable but the target is absent
 * → a NEW dangling alias = a real connection red), or null (the `<pkg>/src` root cannot be
 * located from the path → honestly NOT judged here, never red-by-guess).
 */
function aliasResolvesAbs(fromAbs: string, spec: string): boolean | null {
  if (!spec.startsWith('@/')) return null;
  const m = fromAbs.replaceAll('\\', '/').match(/^(.*\/(?:frontend|backend|worker)\/src)\//);
  if (!m) return null; // cannot locate the package src root → unjudged (not our fact here)
  const baseAbs = path.join(m[1], spec.slice(2));
  return candidatesFor(baseAbs).some((cand) => {
    const r = path.resolve(cand);
    return pending.has(r) || fs.existsSync(cand);
  });
}

export interface ConnectionVerdict {
  green: boolean;
  reds: string[];
}

/**
 * Byte-floor connection fact for a single file write. Reads the file's prior
 * content (if any) so only NEW relative imports are judged. A brand-new file is
 * all-new, so every relative import in it must resolve.
 */
export function checkConnectionByteFloor(absPath: string, content: string): ConnectionVerdict {
  if (!SOURCE_RE.test(absPath)) return { green: true, reds: [] };
  let beforeSpecs: Set<string>;
  try {
    beforeSpecs = new Set(extractImportSpecifiers(fs.readFileSync(absPath, 'utf8')));
  } catch {
    beforeSpecs = new Set(); // file does not exist yet → every wire is new
  }
  const reds: string[] = [];
  for (const spec of extractImportSpecifiers(content)) {
    if (beforeSpecs.has(spec)) continue; // unchanged wire — not this write's claim
    if (spec.startsWith('@/')) {
      // path alias: resolve via the <pkg>/src convention. A located-but-absent target is a
      // NEW dangling alias (red); a non-locatable src root is honestly NOT judged here.
      if (aliasResolvesAbs(absPath, spec) === false) reds.push(spec);
      continue;
    }
    if (!relativeImportResolvesAbs(absPath, spec)) reds.push(spec);
  }
  return { green: reds.length === 0, reds };
}

/** Walk up node_modules from a file, true iff the package's package.json byte-exists. */
function bareResolves(fromAbs: string, spec: string): boolean {
  const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : (spec.split('/')[0] ?? spec);
  let dir = path.dirname(fromAbs);
  for (let i = 0; i < 40; i += 1) {
    if (fs.existsSync(path.join(dir, 'node_modules', pkg, 'package.json'))) return true;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return false;
}

const GO_FILE_RE = /\.go$/;

/** Extract Go import paths — both single (`import "x"`) and grouped (`import ( "a"\n"b" )`). */
function extractGoImports(content: string): string[] {
  const code = blankComments(content);
  const out: string[] = [];
  for (const m of code.matchAll(/\bimport\s+"([^"]+)"/g)) out.push(m[1]);
  for (const block of code.matchAll(/\bimport\s*\(([\s\S]*?)\)/g)) {
    for (const q of block[1].matchAll(/"([^"]+)"/g)) out.push(q[1]);
  }
  return [...new Set(out)];
}

/** The set of module paths a go.mod declares (require block + the module's own path). null = no go.mod found. */
function goModRequiresWalkUp(fromAbs: string): Set<string> | null {
  let dir = path.dirname(fromAbs);
  for (let i = 0; i < 40; i += 1) {
    const gm = path.join(dir, 'go.mod');
    if (fs.existsSync(gm)) {
      try {
        const src = fs.readFileSync(gm, 'utf8');
        const reqs = new Set<string>();
        for (const m of src.matchAll(/^\s*(?:require\s+)?([a-z0-9.\-/]+\.[a-z0-9.\-/]+)\s+v?\d/gim)) reqs.add(m[1]);
        const self = src.match(/^\s*module\s+(\S+)/m);
        if (self) reqs.add(self[1]);
        return reqs;
      } catch { return new Set(); }
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/**
 * Byte-floor SYNC supply-chain check — the dependency twin of the connection gate,
 * kept synchronous so it survives at the byte floor even though the full
 * perception-based supply-chain gate is async. A NEW bare import to a package that
 * is neither a Node builtin nor present in the installed tree (nor an @/-alias) is
 * a dangling dependency wire. Relative imports are the connection gate's concern.
 *
 * L07: Go is now judged too — provably false-positive-free because a Go stdlib import
 * has NO dot in its first path segment (`strings`, `net/http`), whereas an external
 * module path always carries a domain (`github.com/x/y`). So we only ever red a NEW
 * dotted import that no go.mod require covers; stdlib is structurally never touched.
 * Rust/Python/Java are NOT wired here (local modules look like external deps; an
 * incomplete stdlib set would false-positive) — see lang-supply-chain.proof.mjs.
 */
export function checkSupplyChainByteFloor(absPath: string, content: string): ConnectionVerdict {
  if (GO_FILE_RE.test(absPath)) {
    const requires = goModRequiresWalkUp(absPath);
    if (requires === null) return { green: true, reds: [] }; // no go.mod → unjudged (honest)
    let beforeImports: Set<string>;
    try { beforeImports = new Set(extractGoImports(fs.readFileSync(absPath, 'utf8'))); } catch { beforeImports = new Set(); }
    const reds: string[] = [];
    for (const spec of extractGoImports(content)) {
      if (beforeImports.has(spec)) continue;          // delta: only this write's NEW imports
      const root = spec.split('/')[0] ?? spec;
      if (!root.includes('.')) continue;              // stdlib (no dot in root) → NEVER dangling (sound)
      let covered = false;
      for (const r of requires) if (spec === r || spec.startsWith(`${r}/`)) { covered = true; break; }
      if (!covered) reds.push(spec);
    }
    return { green: reds.length === 0, reds };
  }
  // JS/TS only: node_modules resolution is the wrong model for every other
  // language (Rust/Python/Java/C…), so a non-JS file yields no supply-chain
  // fact here rather than a false dangling-dependency red on a stdlib import.
  if (!JS_SUPPLY_CHAIN_RE.test(absPath)) return { green: true, reds: [] };
  let beforeSpecs: Set<string>;
  try {
    beforeSpecs = new Set(extractImportSpecifiers(fs.readFileSync(absPath, 'utf8')));
  } catch {
    beforeSpecs = new Set();
  }
  const reds: string[] = [];
  for (const spec of extractImportSpecifiers(content)) {
    if (beforeSpecs.has(spec)) continue; // not this write's claim
    if (spec.startsWith('.')) continue; // relative → connection gate's fact
    if (spec.startsWith('@/') || isBuiltin(spec)) continue; // path alias / Node builtin
    if (!bareResolves(absPath, spec)) reds.push(spec);
  }
  return { green: reds.length === 0, reds };
}
