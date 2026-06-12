/**
 * server-tools-readcode.ts — Unified adaptive readCode tool (CodeStruct port).
 *
 * Replaces the three-tool pattern (code_browse + code_outline + code_read_symbol)
 * with ONE tool that auto-adapts its output based on the context:
 *
 *   Mode 1 — Directory: list files (like `code_browse`)
 *   Mode 2 — File, no selector, small: return FULL content (CodeStruct <3K chars by default)
 *   Mode 3 — File, no selector, large: return compact signatures (like `code_outline`)
 *   Mode 4 — File + selector: return full implementation of matched symbol
 *            (like `code_read_symbol` with 5-tier fuzzy matching)
 *
 * This matches CodeStruct's Section 3.2 (Algorithm 1) design: the agent expresses
 * WHAT it wants to read via a path + optional selector; the tool decides HOW to
 * deliver it. One tool = fewer LLM decisions = fewer tokens burned = higher
 * Pass@1 (CodeStruct §4.4.1 ablation shows readCode is the dominant accuracy lever).
 *
 * The existing tools (code_browse, code_outline, code_read_symbol) are preserved
 * for backward compatibility — this is an ADDITION, not a replacement.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { activeWorkspaceRoot, resolveSafeTarget } from './guard.js';
import { readUtf8, sha256 } from './server-helpers-io.js';
import { ok, fail } from './server-helpers-result.js';
import { browse } from './nav.js';
import { extToGrammar } from './engine-universal.js';
import { fuzzyMatch } from './fuzzy-match.js';
import { selectorNotFound } from './llm-errors.js';

// Re-use the existing outline/readSymbol for the heavy lifting
let _outlineFn: ((file: string, text: string) => Promise<{
  language: string;
  lineCount: number;
  charCount: number;
  symbols: Array<{ selector: string; kind: string; startLine: number; endLine: number; signature: string }>;
}>) | null = null;
let _readSymbolFn: ((file: string, text: string, selector: string, position?: { line: number; column: number }) => Promise<{
  selector: string;
  kind: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  code: string;
  fileSha256?: string;
}>) | null = null;

// Lazy-load to avoid circular dependency at module init
async function loadNav(): Promise<void> {
  if (_outlineFn) return;
  const nav = await import('./nav.js');
  _outlineFn = nav.outline;
  _readSymbolFn = nav.readSymbol;
}

// ──────────────────────── thresholds ──────────────────────────

const SMALL_FILE_LIMIT = 3000; // compact default; callers can opt into larger full reads
const LARGE_DIR_LIMIT = 200;    // files — show summary not full listing
const MAX_SYMBOLS_INLINE = 25;  // compact summary cutoff

// ──────────────────────── helpers ──────────────────────────

interface FormatSignaturesOptions {
  symbols: Array<{ selector: string; kind: string; startLine: number; endLine: number; signature: string }>;
  file: string;
  maxInline: number;
}

function formatSignaturesCompact(opts: FormatSignaturesOptions): string[] {
  const { symbols, file, maxInline } = opts;
  const lines: string[] = [];
  lines.push(`Signatures in ${file} (${symbols.length} symbols):`);
  for (const s of symbols.slice(0, maxInline)) {
    lines.push(`  L${s.startLine}: ${s.selector} (${s.kind})${s.signature ? ` — ${s.signature.slice(0, 80)}` : ''}`);
  }
  if (symbols.length > maxInline) {
    lines.push(`  … and ${symbols.length - maxInline} more symbols. Use a selector to read a specific one.`);
  }
  return lines;
}

function formatSymbolFull(opts: FormatSignaturesOptions): string {
  const { symbols, file } = opts;
  return [
    `Full content of ${file} (${symbols.length} symbols)`,
    '',
    ...formatSignaturesCompact(opts),
  ].join('\n');
}

function joinReadPath(dir: string, name: string): string {
  const cleanDir = dir === '.' ? '' : dir.replace(/\/+$/, '');
  return cleanDir ? `${cleanDir}/${name}` : name;
}

function workspaceDisplayPath(absPath: string, relPath: string): string {
  const activeRel = path.relative(activeWorkspaceRoot(), absPath).split(path.sep).join('/');
  if (activeRel === '') return '.';
  if (!activeRel.startsWith('..') && !path.isAbsolute(activeRel)) return activeRel;
  return relPath || '.';
}

function readcodeTargetDetails(displayPath: string): Record<string, unknown> {
  return {
    target: {
      root: 'active-workspace',
      file: displayPath,
    },
  };
}

function readcodeBatchNextForDirectory(
  dir: string,
  entries: Array<{ name: string; type: string }>,
): { tool: 'code_readcode_batch'; reason: string; items: Array<{ path: string }> } | null {
  const items = entries
    .filter((entry) => entry.type === 'file')
    .slice(0, 20)
    .map((entry) => ({ path: joinReadPath(dir || '.', entry.name) }));
  if (items.length < 2) return null;
  return {
    tool: 'code_readcode_batch',
    reason: 'Directory has a small cluster of files; batch-read these paths before issuing repeated single-path code_readcode calls.',
    items,
  };
}

// ──────────────────────── main tool ──────────────────────────

export function registerReadCodeTool(server: McpServer): void {
  server.registerTool(
    'code_readcode',
    {
      title: 'Unified adaptive code reader (CodeStruct readCode port)',
      description:
        'ONE tool for all code reading — automatically adapts its output:\n' +
        '• Directory → file listing\n' +
        '• File, no selector, small (<3K chars by default) → FULL content\n' +
        '• File, no selector, large → compact signature summary\n' +
        '• File + selector → full implementation of the matched symbol\n' +
        '\n' +
        'Selectors support 5-tier fuzzy matching: exact, case-insensitive, prefix,\n' +
        'CamelCase initials (UM→UserManager), subsequence (usrmgr→UserManager),\n' +
        'and consonant skeleton. Use unscoped names (load) or scoped (User.load).\n' +
        '\n' +
        'This is the recommended read-side primary tool for one path/selector. Directory responses include batchNext ' +
        'with a ready code_readcode_batch call when a small file cluster is visible. When several paths are known, ' +
        'prefer code_readcode_batch over repeated code_browse/code_readcode calls; when several symbols are already known, ' +
        'prefer code_read_symbols_batch over repeated code_readcode/code_read_symbol calls. Both batch tools reduce serial ' +
        'read surface and token cost for macro transactions. code_browse, code_outline, and code_read_symbol remain available ' +
        'for explicit mode selection.',
      inputSchema: {
        path: z
          .string()
          .describe(
            'File path, directory path, or repo-relative path. ' +
            "Use '.' for repo root, 'src/' for a subdirectory, 'src/foo.ts' for a file.",
          ),
        selector: z
          .string()
          .optional()
          .describe(
            "Optional AST selector. Unscoped: 'load', 'UserService'. Scoped: 'User.load', 'Auth.login'. " +
            'Fuzzy matching recovers from minor typos/hallucinations (e.g. calcuator→Calculator). ' +
            'When omitted, adaptive summarization mode is used (full content or signatures).',
          ),
        maxFullChars: z.number().int().min(1).max(50000).optional().describe(
          'Optional cutoff for returning full content without a selector. Defaults to the normal 3K readCode threshold.',
        ),
      },
    },
    async (a) => {
      try {
        await loadNav();
        const { absPath, relPath } = resolveSafeTarget(a.path || '.');

        // ── Mode 1: Directory ──
        const st = fs.statSync(absPath);
        if (st.isDirectory()) {
          const entries = browse(absPath);
          const dir = workspaceDisplayPath(absPath, relPath);
          const displayPath = dir;
          const batchNext = readcodeBatchNextForDirectory(dir, entries);
          if (entries.length <= LARGE_DIR_LIMIT) {
            return ok({
              ok: true,
              mode: 'directory',
              dir,
              ...readcodeTargetDetails(displayPath),
              entries,
              batchNext,
              summaryForHuman:
                `Directory: ${dir} (${entries.length} entries)\n` +
                entries.map((e) => `  ${e.name}${e.type === 'dir' ? '/' : ''}`).join('\n') +
                (batchNext ? `\n\nRecommended next call: ${batchNext.tool} for ${batchNext.items.length} file(s) in this directory.` : ''),
            });
          }
          return ok({
            ok: true,
            mode: 'directory',
            dir,
            ...readcodeTargetDetails(displayPath),
            entryCount: entries.length,
            note: `Directory has ${entries.length} entries. Use a more specific path or a file selector.`,
            summaryForHuman:
              `Directory: ${dir} (${entries.length} entries — too many to list). ` +
              'Navigate into a subdirectory or specify a file.',
          });
        }

        // ── File ──
        const text = readUtf8(absPath);
        const displayPath = workspaceDisplayPath(absPath, relPath);
        const fileSha = sha256(text);
        const ext = path.extname(absPath).toLowerCase();
        const grammar = extToGrammar(ext);
        const fullLimit = typeof a.maxFullChars === 'number' ? a.maxFullChars : SMALL_FILE_LIMIT;

        // ── Mode 4: File + selector ──
        if (a.selector) {
          try {
            const r = await _readSymbolFn!(relPath, text, a.selector);
            return ok({
              ok: true,
              mode: 'symbol',
              file: displayPath,
              ...readcodeTargetDetails(displayPath),
              resolvedSelector: r.selector,
              kind: r.kind,
              startLine: r.startLine,
              startColumn: r.startColumn,
              endLine: r.endLine,
              endColumn: r.endColumn,
              code: r.code,
              fileSha256: fileSha,
              language: grammar ?? 'text',
              summaryForHuman:
                `Symbol "${r.selector}" (${r.kind}) at ${displayPath}:${r.startLine}-${r.endLine} ` +
                `(${r.endLine - r.startLine + 1} lines, ${r.code.length} chars, ${grammar ?? 'text'}). ` +
                `Code is in the structured JSON payload.`,
            });
          } catch (symbolErr) {
            // fuzzy match fallback — show candidates inline
            const o = await _outlineFn!(relPath, text);
            const candidates = o.symbols.map((s) => s.selector);
            const fuzzyResults = fuzzyMatch(a.selector, candidates, { minScore: 50, maxCandidates: 10 });
            throw new Error(
              selectorNotFound({
                selector: a.selector,
                file: displayPath,
                available: candidates,
                fuzzyCandidates: fuzzyResults.length > 0 ? fuzzyResults : undefined,
                language: grammar ?? 'text',
              }),
            );
          }
        }

        // ── Mode 2 & 3: File, no selector ──
        if (text.length < fullLimit) {
          // Mode 2: small file → FULL content
          const o = await _outlineFn!(relPath, text);
          const lineCount = text.split('\n').length;
          return ok({
            ok: true,
            mode: 'full',
            file: displayPath,
            ...readcodeTargetDetails(displayPath),
            language: o.language,
            lineCount,
            charCount: text.length,
            fullContentThreshold: fullLimit,
            symbolCount: o.symbols.length,
            content: text,
            fileSha256: fileSha,
            symbols: o.symbols,
            summaryForHuman:
              `Full content of ${displayPath} (${lineCount} lines, ${o.symbols.length} symbols, ` +
              `${grammar ?? 'text'}, ${text.length} chars). Content is in the structured JSON payload.`,
          });
        }

        // Mode 3: large file → compact signatures
        const o = await _outlineFn!(relPath, text);
        const lineCount = text.split('\n').length;
        const compactLines = formatSignaturesCompact({
          symbols: o.symbols,
          file: displayPath,
          maxInline: MAX_SYMBOLS_INLINE,
        });
        return ok({
          ok: true,
          mode: 'summary',
          file: displayPath,
          ...readcodeTargetDetails(displayPath),
          language: o.language,
          lineCount,
          charCount: text.length,
          fullContentThreshold: fullLimit,
          symbolCount: o.symbols.length,
          symbols: o.symbols,
          fileSha256: fileSha,
          summaryForHuman:
            compactLines.join('\n') +
            `\n\nFile is ${lineCount} lines (${text.length} chars). Use a selector to read a specific symbol.`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );


  server.registerTool(
    'code_readcode_batch',
    {
      title: 'Batch adaptive code reader for clustered context',
      description:
        'Batch form of code_readcode: read several directories/files/symbols in one tool call. ' +
        'Use this before repeated code_browse/code_readcode calls when a task spans a small cluster of known paths. ' +
        'Each item adapts independently: directory listing, full small file, compact large-file summary, or selected symbol. ' +
        'This reduces serial read overhead without forcing whole-file reads when a selector is provided.',
      inputSchema: {
        items: z.array(z.object({
          path: z.string().describe('repo-relative path or absolute path inside the active workspace'),
          selector: z.string().optional().describe('optional AST selector; when present, only that symbol body is returned'),
        })).min(1).max(20).describe('Directories/files/symbols to read as one adaptive context batch'),
        maxFullCharsPerFile: z.number().int().min(1).max(50000).optional().describe(
          'Optional small-file cutoff for returning full content. Defaults to the normal 3K readCode threshold.',
        ),
      },
    },
    async (a) => {
      try {
        await loadNav();
        const fullLimit = typeof a.maxFullCharsPerFile === 'number' ? a.maxFullCharsPerFile : SMALL_FILE_LIMIT;
        const results = [];
        for (const item of a.items) {
          try {
            const { absPath, relPath } = resolveSafeTarget(item.path || '.');
            const st = fs.statSync(absPath);
            if (st.isDirectory()) {
              const entries = browse(absPath);
              const dir = workspaceDisplayPath(absPath, relPath);
          const displayPath = dir;
              results.push({
                ok: true,
                mode: 'directory',
                dir,
                ...readcodeTargetDetails(displayPath),
                entries: entries.length <= LARGE_DIR_LIMIT ? entries : undefined,
                entryCount: entries.length,
                truncated: entries.length > LARGE_DIR_LIMIT,
                batchNext: readcodeBatchNextForDirectory(dir, entries),
              });
              continue;
            }

            const text = readUtf8(absPath);
            const displayPath = workspaceDisplayPath(absPath, relPath);
            const fileSha = sha256(text);
            const ext = path.extname(absPath).toLowerCase();
            const grammar = extToGrammar(ext);
            if (item.selector) {
              const r = await _readSymbolFn!(relPath, text, item.selector);
              results.push({
                ok: true,
                mode: 'symbol',
                file: displayPath,
                ...readcodeTargetDetails(displayPath),
                requestedSelector: item.selector,
                resolvedSelector: r.selector,
                kind: r.kind,
                startLine: r.startLine,
                startColumn: r.startColumn,
                endLine: r.endLine,
                endColumn: r.endColumn,
                code: r.code,
                fileSha256: fileSha,
                language: grammar ?? 'text',
              });
              continue;
            }

            const o = await _outlineFn!(relPath, text);
            const lineCount = text.split('\n').length;
            if (text.length < fullLimit) {
              results.push({
                ok: true,
                mode: 'full',
                file: displayPath,
                ...readcodeTargetDetails(displayPath),
                language: o.language,
                lineCount,
                charCount: text.length,
                fullContentThreshold: fullLimit,
                symbolCount: o.symbols.length,
                content: text,
                fileSha256: fileSha,
                symbols: o.symbols,
              });
              continue;
            }

            results.push({
              ok: true,
              mode: 'summary',
              file: displayPath,
              ...readcodeTargetDetails(displayPath),
              language: o.language,
              lineCount,
              charCount: text.length,
              fullContentThreshold: fullLimit,
              symbolCount: o.symbols.length,
              symbols: o.symbols,
              fileSha256: fileSha,
              compactSignatures: formatSignaturesCompact({
                symbols: o.symbols,
                file: displayPath,
                maxInline: MAX_SYMBOLS_INLINE,
              }),
            });
          } catch (itemErr) {
            results.push({
              ok: false,
              path: item.path,
              selector: item.selector,
              error: itemErr instanceof Error ? itemErr.message : String(itemErr),
            });
          }
        }
        const failed = results.filter((result) => result.ok !== true);
        return ok({
          ok: failed.length === 0,
          mode: 'readcode-batch',
          requested: a.items.length,
          returned: results.length - failed.length,
          failed: failed.length,
          results,
          summaryForHuman:
            'code_readcode_batch returned ' + (results.length - failed.length) + '/' + a.items.length +
            ' adaptive context item(s); ' + failed.length + ' failed.',
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'code_read_symbols_batch',
    {
      title: 'Read multiple symbols in one compact batch',
      description:
        'Batch form of code_readcode(file+selector): read 1-N specific symbols across files in one tool call. ' +
        'Use this before repeated code_readcode/code_read_symbol calls when a clustered edit needs several known ' +
        'methods/interfaces/types. It returns only requested symbol bodies plus per-file sha256, not whole files, ' +
        'so it reduces duplicate read surface and token cost for macro transactions.',
      inputSchema: {
        items: z.array(z.object({
          path: z.string().describe('repo-relative file path or absolute path inside the active workspace'),
          selector: z.string().describe("AST selector to read, e.g. 'FieldSchema' or 'BinarySerde.computeSize'"),
        })).min(1).max(20).describe('Symbols to read as one compact batch'),
      },
    },
    async (a) => {
      try {
        await loadNav();
        const results = [];
        for (const item of a.items) {
          try {
            const { absPath, relPath } = resolveSafeTarget(item.path);
            const text = readUtf8(absPath);
            const displayPath = workspaceDisplayPath(absPath, relPath);
            const fileSha = sha256(text);
            const ext = path.extname(absPath).toLowerCase();
            const grammar = extToGrammar(ext);
            const r = await _readSymbolFn!(relPath, text, item.selector);
            results.push({
              ok: true,
              file: displayPath,
              ...readcodeTargetDetails(displayPath),
              requestedSelector: item.selector,
              resolvedSelector: r.selector,
              kind: r.kind,
              startLine: r.startLine,
              startColumn: r.startColumn,
              endLine: r.endLine,
              endColumn: r.endColumn,
              code: r.code,
              fileSha256: fileSha,
              language: grammar ?? 'text',
            });
          } catch (itemErr) {
            results.push({
              ok: false,
              file: item.path,
              selector: item.selector,
              error: itemErr instanceof Error ? itemErr.message : String(itemErr),
            });
          }
        }
        const failed = results.filter((result) => result.ok !== true);
        return ok({
          ok: failed.length === 0,
          mode: 'symbols-batch',
          requested: a.items.length,
          returned: results.length - failed.length,
          failed: failed.length,
          results,
          summaryForHuman:
            `code_read_symbols_batch returned ${results.length - failed.length}/${a.items.length} requested symbol(s); ` +
            `${failed.length} failed.`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
