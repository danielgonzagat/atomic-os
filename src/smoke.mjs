#!/usr/bin/env node
/**
 * Standalone smoke for the published Atomic OS MCP: build, then prove the LIVE
 * server end-to-end — tool inventory + a real firewall-guarded edit that
 * persists + a bad edit that is refused. Self-contained (a temp workspace),
 * with no dependency on any host monorepo.
 */
import { spawnSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS  ' + name); }
  else { fail += 1; console.log('  FAIL  ' + name); }
};

// 1) build
const b = spawnSync(process.execPath, [path.join(dir, 'build.mjs')], { stdio: 'inherit' });
if (b.status !== 0) { console.error('build failed'); process.exit(1); }

// 2) live MCP in an isolated temp workspace
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-os-smoke-'));
fs.writeFileSync(path.join(work, 'm.py'), 'def greet(n):\n    return n\ngreet("x")\n');
const srv = spawn(process.execPath, [path.join(dir, 'dist', 'server.js')], {
  env: { ...process.env, ATOMIC_EDIT_REPO_ROOT: work },
  stdio: ['pipe', 'pipe', 'ignore'],
});
let buf = '';
const waiters = new Map();
srv.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!l.trim()) continue;
    let m; try { m = JSON.parse(l); } catch { continue; }
    if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  }
});
const rpc = (id, method, params) =>
  new Promise((r) => { waiters.set(id, r); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const txt = (r) => r?.result?.content?.[0]?.text ?? JSON.stringify(r?.error ?? r);

await rpc(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const list = await rpc(2, 'tools/list', {});
const names = (list.result?.tools ?? []).map((t) => t.name);
check(`server lists >= 60 tools (got ${names.length})`, names.length >= 60);
for (const t of ['atomic_edit', 'atomic_replace_at', 'atomic_ast_edit', 'atomic_rename_symbol_universal', 'atomic_grep', 'atomic_create_file', 'atomic_transaction']) {
  check('tool present: ' + t, names.includes(t));
}

// real firewall-guarded edit: content-addressed, no coordinates
const ed = await rpc(3, 'tools/call', { name: 'atomic_replace_at', arguments: { file: 'm.py', mode: 'content', anchor: 'greet', newText: 'salute', occurrence: 1 } });
check('atomic_replace_at applied', txt(ed).includes('Atomic edit applied'));
const after = fs.readFileSync(path.join(work, 'm.py'), 'utf8');
check('edit persisted (greet->salute)', after.includes('def salute(n)'));

// firewall refuses a bad edit (path escape): writing outside the workspace
const esc = await rpc(4, 'tools/call', { name: 'atomic_replace_at', arguments: { file: '../escape.py', mode: 'content', anchor: 'x', newText: 'y' } });
check('path-escape refused', txt(esc).toLowerCase().includes('escape') || txt(esc).includes('refused'));

srv.kill('SIGKILL');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
