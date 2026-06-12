#!/usr/bin/env node
/**
 * Proof for compact readCode target metadata and token-bounded full reads.
 * code_readcode is the hot read path for ALL-IN workers, so its default must
 * prefer symbol summaries over large full-content payloads while still allowing
 * an explicit full-content override when the caller proves they need it.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const compiledServer = path.join(sourceDir, 'dist', 'server.js');

function record(results, name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function parseToolResult(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: text.slice(0, 1000) };
  }
}

function sourceAssertions() {
  const readcode = read('scripts/mcp/atomic-edit/server-tools-readcode.ts');
  return {
    readcodeUsesCompactLocalTarget:
      readcode.includes('function readcodeTargetDetails(displayPath: string): Record<string, unknown>') &&
      readcode.includes("root: 'active-workspace'") &&
      readcode.includes('...readcodeTargetDetails(displayPath),'),
    readcodeNoLongTargetHelper:
      !readcode.includes("import { readUtf8, targetDetails, sha256 }") &&
      !readcode.includes('...targetDetails(absPath, displayPath),'),
    readcodeDefaultFullLimitIsThreeK:
      readcode.includes('const SMALL_FILE_LIMIT = 3000') &&
      readcode.includes('small (<3K chars by default)') &&
      readcode.includes('Defaults to the normal 3K readCode threshold'),
    readcodeSingleToolHasExplicitOverride:
      readcode.includes('maxFullChars: z') &&
      readcode.includes("const fullLimit = typeof a.maxFullChars === 'number' ? a.maxFullChars : SMALL_FILE_LIMIT") &&
      readcode.includes('if (text.length < fullLimit)') &&
      readcode.includes('fullContentThreshold: fullLimit'),
    readcodeBatchKeepsExplicitOverride:
      readcode.includes('maxFullCharsPerFile') &&
      readcode.includes("const fullLimit = typeof a.maxFullCharsPerFile === 'number' ? a.maxFullCharsPerFile : SMALL_FILE_LIMIT"),
  };
}

async function withClient(proofRoot, workspace, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [compiledServer],
    cwd: repoRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_EDIT_MCP_SELF_HOSTED: '1',
      ATOMIC_EDIT_ALLOW_SELF_HOSTED: '1',
      ATOMIC_EDIT_REPO_ROOT: proofRoot,
      ATOMIC_WORKSPACE_ROOT: workspace,
      ATOMIC_EDIT_ALLOWED_ROOTS: '',
    },
  });
  const client = new Client({ name: 'readcode-compact-target-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    try { await client.close(); } catch {}
  }
}

function containsAbsoluteLeak(body, proofRoot, workspace) {
  const text = JSON.stringify(body);
  return text.includes(proofRoot) || text.includes(workspace) || text.includes('"absPath"') || text.includes('"repoRoot"');
}

async function dynamicReadcodeProof() {
  const proofRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'readcode-compact-target-proof-'));
  const workspace = path.join(proofRoot, 'worker');
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'src', 'example.ts'), [
    'export function alpha(input: number): number {',
    '  return input + 1;',
    '}',
    '',
    'export function beta(input: string): string {',
    '  return input.toUpperCase();',
    '}',
    '',
  ].join('\n'));
  fs.writeFileSync(
    path.join(workspace, 'src', 'medium.ts'),
    'export const medium = ' + JSON.stringify('x'.repeat(3600)) + ';\n',
  );
  fs.writeFileSync(path.join(workspace, 'package.json'), '{"type":"module"}\n');

  try {
    return await withClient(proofRoot, workspace, async (client) => {
      const dir = parseToolResult(await client.callTool({ name: 'code_readcode', arguments: { path: 'src' } }, undefined, { timeout: 30000 }));
      const file = parseToolResult(await client.callTool({ name: 'code_readcode', arguments: { path: 'src/example.ts' } }, undefined, { timeout: 30000 }));
      const mediumDefault = parseToolResult(await client.callTool({ name: 'code_readcode', arguments: { path: 'src/medium.ts' } }, undefined, { timeout: 30000 }));
      const mediumOverride = parseToolResult(await client.callTool({ name: 'code_readcode', arguments: { path: 'src/medium.ts', maxFullChars: 5000 } }, undefined, { timeout: 30000 }));
      const batch = parseToolResult(await client.callTool({
        name: 'code_readcode_batch',
        arguments: { items: [{ path: 'src/example.ts' }, { path: 'src/example.ts', selector: 'beta' }] },
      }, undefined, { timeout: 30000 }));
      const symbols = parseToolResult(await client.callTool({
        name: 'code_read_symbols_batch',
        arguments: { items: [{ path: 'src/example.ts', selector: 'alpha' }] },
      }, undefined, { timeout: 30000 }));
      const bodies = { dir, file, mediumDefault, mediumOverride, batch, symbols };
      const noLeaks = Object.values(bodies).every((body) => !containsAbsoluteLeak(body, proofRoot, workspace));
      return {
        ok:
          dir.ok === true &&
          dir.target?.file === 'src' &&
          dir.target?.root === 'active-workspace' &&
          file.ok === true &&
          file.target?.file === 'src/example.ts' &&
          file.target?.root === 'active-workspace' &&
          file.mode === 'full' &&
          file.fullContentThreshold === 3000 &&
          mediumDefault.ok === true &&
          mediumDefault.mode === 'summary' &&
          mediumDefault.fullContentThreshold === 3000 &&
          mediumDefault.content === undefined &&
          mediumOverride.ok === true &&
          mediumOverride.mode === 'full' &&
          mediumOverride.fullContentThreshold === 5000 &&
          typeof mediumOverride.content === 'string' &&
          batch.ok === true &&
          batch.results?.every((entry) => entry.target?.root === 'active-workspace') &&
          symbols.ok === true &&
          symbols.results?.every((entry) => entry.target?.file === 'src/example.ts') &&
          noLeaks,
        bodies,
        noLeaks,
      };
    });
  } finally {
    fs.rmSync(proofRoot, { recursive: true, force: true });
  }
}

async function main() {
  const results = [];
  const source = sourceAssertions();
  for (const [name, ok] of Object.entries(source)) record(results, name, ok, { ok });
  if (!fs.existsSync(compiledServer)) {
    record(results, 'dynamic MCP proof has built dist/server.js', false, { missing: compiledServer });
  } else {
    const dynamic = await dynamicReadcodeProof();
    record(results, 'readCode target metadata is compact and default full reads are bounded', dynamic.ok, dynamic);
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const result = await main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write((entry.ok ? 'PASS ' : 'FAIL ') + entry.name + '\n');
process.exit(result.ok ? 0 : 1);
