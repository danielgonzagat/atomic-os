#!/usr/bin/env node
/**
 * atomic — the proof-chain CLI. "Semantic git for agents": every Atomic OS
 * mutation leaves a tamper-evident, content-addressed trace in .atomic/traces/,
 * chained through .atomic/HEAD. This CLI reads that chain.
 *
 *   atomic verify [<opId>|--head]   recompute the chain hash + check the file is still in the recorded state
 *   atomic explain <opId>           human-readable: intention, proof, char diff, gate verdict
 *   atomic log [-n N]               walk the proof chain newest -> oldest
 *   atomic compare                  run AtomicBench (atomic vs line/file rewrite)
 *   atomic replay|undo <opId>       (see note) traces are PROOF, not content snapshots
 *
 * Honest by construction: verify recomputes the SAME chain hash the engine wrote
 * (parentSha256 ‖ afterSha256 ‖ canonicalJSON(gateVerdict)); tamper with any of
 * the three and it stops matching. No content is invented.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// EXACT replica of trace.ts canonicalJSON — sorted keys at every depth, undefined->null.
function canonicalJSON(value) {
  const norm = (v) => {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.map(norm);
    if (typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = norm(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}
const chainHashOf = (parent, after, gateVerdict) => sha256(`${parent}‖${after}‖${canonicalJSON(gateVerdict)}`);

function repoRoot(start = process.cwd()) {
  let d = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(d, '.atomic', 'traces'))) return d;
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return path.resolve(start);
    d = up;
  }
}
function tracesDir() { return path.join(repoRoot(), '.atomic', 'traces'); }
function headChain() {
  const h = path.join(repoRoot(), '.atomic', 'HEAD');
  return fs.existsSync(h) ? fs.readFileSync(h, 'utf8').trim() : '';
}
function allTraces() {
  const td = tracesDir();
  if (!fs.existsSync(td)) return [];
  return fs.readdirSync(td).filter((f) => f.endsWith('.json')).map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(td, f), 'utf8')); } catch { return null; }
  }).filter(Boolean);
}
function loadTrace(opId) {
  const td = tracesDir();
  const direct = path.join(td, `${opId}.json`);
  if (fs.existsSync(direct)) return JSON.parse(fs.readFileSync(direct, 'utf8'));
  return allTraces().find((t) => t.operationId === opId) || null;
}
function headTrace() {
  const head = headChain();
  if (!head) return null;
  return allTraces().find((t) => t.chainHash === head) || null;
}
const die = (m) => { console.error(m); process.exit(1); };

function cmdVerify(arg) {
  const t = !arg || arg === '--head' ? headTrace() : loadTrace(arg);
  if (!t) die(`no trace found for ${arg || '(HEAD)'} under ${tracesDir()}`);
  const recomputed = chainHashOf(t.parentSha256 ?? '', t.afterSha256, t.gateVerdict);
  const chainOk = recomputed === t.chainHash;
  let fileState = 'unknown';
  const abs = t.repoRoot ? path.join(t.repoRoot, t.file) : path.join(repoRoot(), t.file);
  if (fs.existsSync(abs)) {
    const onDisk = sha256(fs.readFileSync(abs, 'utf8'));
    fileState = onDisk === t.afterSha256 ? 'matches the recorded afterSha256 (unchanged since)' : 'CHANGED since this op (later edits or external change)';
  } else if (t.changed) fileState = 'file no longer exists';
  console.log(`op        ${t.operationId}`);
  console.log(`operator  ${t.operator}  ·  file ${t.file}`);
  console.log(`chain     ${chainOk ? 'OK — tamper-evident hash recomputes' : 'TAMPERED — recomputed hash != recorded chainHash'}`);
  console.log(`          chainHash=${t.chainHash}`);
  console.log(`          parent  =${t.parentSha256 || '(genesis)'}`);
  console.log(`file      ${fileState}`);
  console.log(`verdict   ${chainOk ? 'VERIFIED' : 'FAILED'}`);
  process.exit(chainOk ? 0 : 2);
}

function cmdExplain(opId) {
  if (!opId) die('usage: atomic explain <opId>');
  const t = loadTrace(opId);
  if (!t) die(`no trace for ${opId}`);
  const a = t.audit || {};
  const m = t.metrics || {};
  const be = t.byteEffect || {};
  console.log(`# ${t.operationId}`);
  console.log(`when        ${t.ts}`);
  console.log(`operator    ${t.operator}  (target: ${t.targetUnit})`);
  console.log(`file        ${t.file}`);
  console.log(`intention   ${t.intention || '(none recorded)'}`);
  console.log('');
  console.log(`what changed   ${a.whatChanged ?? t.semanticImpact ?? ''}`);
  console.log(`what preserved ${a.whatPreserved ?? ''}`);
  console.log(`how to verify  ${a.howToValidate ?? ''}`);
  console.log(`NOT proven     ${a.notProven ?? ''}`);
  console.log(`trust          promiseClass=${a.promiseClass ?? '?'} · zeroCodeTrust=${a.zeroCodeTrust ?? '?'}`);
  console.log('');
  console.log(`bytes          before=${be.beforeBytes} after=${be.currentAfterBytes ?? be.proposedBytes} (+${be.addedBytes}/-${be.removedBytes}, net ${be.netBytes})`);
  if (m.expansionFactorAvoided !== undefined) console.log(`expansion      intention=${m.intentionChars ?? '?'} chars vs line-surface=${m.lineRewriteSurfaceChars ?? '?'} (avoided ${m.expansionFactorAvoided}x)`);
  console.log(`syntax         before=${t.validation?.syntaxErrorsBefore} after=${t.validation?.syntaxErrorsAfter} (${t.validation?.language})`);
  if (t.negativeActionProof) console.log(`neg-byte proof ${t.negativeActionProof.verdict} — ${String(t.negativeActionProof.proof || '').slice(0, 120)}`);
  console.log(`gate verdict   ${t.gateVerdict ? (t.gateVerdict.didBlock ? 'BLOCKED' : 'admitted (green)') : '(none)'}`);
  console.log('');
  if (t.inlinePreview) console.log(t.inlinePreview.replace(/\[[0-9;]*m/g, ''));
  process.exit(0);
}

function cmdLog(n) {
  const limit = n || 20;
  const byChain = new Map(allTraces().map((t) => [t.chainHash, t]));
  let cur = headChain();
  let i = 0;
  if (!cur) { console.log('(empty proof chain — no .atomic/HEAD)'); process.exit(0); }
  console.log(`proof chain @ ${repoRoot()}/.atomic  (newest first)\n`);
  while (cur && i < limit) {
    const t = byChain.get(cur);
    if (!t) { console.log(`  ${cur.slice(0, 12)}  (missing trace — chain truncated)`); break; }
    const be = t.byteEffect || {};
    console.log(`  ${t.chainHash.slice(0, 12)}  ${t.ts}  ${t.operator.padEnd(22)} ${t.file}  (+${be.addedBytes ?? '?'}/-${be.removedBytes ?? '?'})`);
    cur = t.parentSha256;
    i++;
  }
  if (cur) console.log(`  …${cur.slice(0, 12)} (genesis or older)`);
  process.exit(0);
}

function cmdCompare() {
  const r = spawnSync(process.execPath, [path.join(here, 'bench.mjs')], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}

// ── atomic init — detect the repo and generate plug-and-play governance config ──
function detectRepo(root) {
  const has = (f) => fs.existsSync(path.join(root, f));
  const exts = new Set();
  const walk = (d, depth) => {
    if (depth > 2) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else { const x = path.extname(e.name).toLowerCase(); if (x) exts.add(x); }
    }
  };
  walk(root, 0);
  const langs = [];
  const map = { '.py': 'Python', '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.rb': 'Ruby', '.c': 'C', '.h': 'C', '.cc': 'C++', '.cpp': 'C++', '.sh': 'Bash' };
  for (const [x, l] of Object.entries(map)) if (exts.has(x) && !langs.includes(l)) langs.push(l);
  let pkg = 'unknown', test = null;
  if (has('package.json')) {
    pkg = 'npm';
    try { test = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts?.test ? 'npm test' : null; } catch { /* ignore */ }
  } else if (has('go.mod')) { pkg = 'go'; test = 'go test ./...'; }
  else if (has('Cargo.toml')) { pkg = 'cargo'; test = 'cargo test'; }
  else if (has('pyproject.toml') || has('requirements.txt') || has('setup.py')) { pkg = 'python'; test = 'pytest'; }
  else if (has('pom.xml')) { pkg = 'maven'; test = 'mvn test'; }
  return { langs, pkg, test, ci: has('.github/workflows'), git: has('.git') };
}

function cmdInit() {
  const force = process.argv.includes('--force');
  const root = repoRoot();
  const info = detectRepo(root);
  const created = [], skipped = [];
  const writeIf = (rel, content) => {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && !force) { skipped.push(rel); return; }
    fs.writeFileSync(abs, content);
    created.push(rel);
  };

  const protectedCfg = {
    files: ['CLAUDE.md', 'AGENTS.md', 'atomic-edit.protected.json', ...(info.ci ? ['.github/workflows'] : [])],
    globs: ['**/*.key', '**/*.pem', '**/.env*', '**/secrets*', '**/*.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'Cargo.lock', 'go.sum'],
  };
  writeIf('atomic-edit.protected.json', JSON.stringify(protectedCfg, null, 2) + '\n');

  const rules = [
    '# Atomic OS — agent operating rules (generated by `atomic init`)',
    '',
    `Repo: ${info.langs.join(', ') || 'unknown'} · package manager: ${info.pkg}${info.test ? ` · tests: \`${info.test}\`` : ''}`,
    '',
    '- **Edit only through the atomic-edit MCP tools.** The coarse editor (full-file /',
    '  whole-line Write/Edit, raw `sed`/overwrite) is banned for code.',
    '- **Smallest faithful change.** Edit by content/anchor, never by line/column.',
    '- **Byte-positivity:** removing/overwriting existing bytes needs a written',
    '  `proofOfIncorrectness` (≥20 chars). Additive, correctness-increasing edits flow freely.',
    '- **Multi-file = one transaction** (`atomic_transaction`); long work = a named',
    '  session (`atomic_session_begin` → … → `atomic_session_commit`/`rollback`).',
    info.test ? `- **Validate by the product:** after a change, run \`${info.test}\` and confirm green.` : '- **Validate by the product:** run the test suite and confirm green after a change.',
    '- **Protected paths** in `atomic-edit.protected.json` are refused for all agents.',
    '- Inspect any change with `atomic verify <opId>` / `atomic explain <opId>`; audit the chain with `atomic log`.',
    '',
  ].join('\n');
  writeIf('atomic.agent-rules.md', rules);

  console.log(`atomic init @ ${root}`);
  console.log(`detected: ${info.langs.join(', ') || '(no source detected)'} · pkg=${info.pkg}${info.test ? ` · test="${info.test}"` : ''} · ci=${info.ci} · git=${info.git}`);
  console.log(created.length ? `created: ${created.join(', ')}` : 'created: (none)');
  if (skipped.length) console.log(`skipped (exists; use --force): ${skipped.join(', ')}`);
  console.log('\nnext: add the MCP server to your AI CLI —');
  console.log(JSON.stringify({ mcpServers: { 'atomic-edit': { command: 'bash', args: [path.join(here, 'atomic-edit-mcp-launcher.sh')] } } }, null, 2));
  console.log('\nthen review atomic-edit.protected.json + atomic.agent-rules.md and commit them.');
  process.exit(0);
}

function cmdReplayUndo(verb, opId) {
  if (!opId) die(`usage: atomic ${verb} <opId>`);
  const t = loadTrace(opId);
  if (!t) die(`no trace for ${opId}`);
  console.error(
    `atomic ${verb}: traces are PROOF/audit artifacts (chain hash, byte accounting, gate verdict),\n` +
    `not content snapshots — rollback.strategy = "${t.rollback?.strategy ?? 'caller-held'}". Cold ${verb}\n` +
    `from a trace alone would invent content, which Atomic OS will not do.\n` +
    `  • live reversal: use atomic_session_begin/rollback (snapshots the file set for the window).\n` +
    `  • cold ${verb}: planned via an opt-in .atomic/snapshots/ content layer (roadmap pillar #4).\n` +
    `Use \`atomic verify ${opId}\` / \`atomic explain ${opId}\` to inspect this op now.`,
  );
  process.exit(3);
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
  case 'verify': cmdVerify(rest[0]); break;
  case 'explain': cmdExplain(rest[0]); break;
  case 'log': { const i = rest.indexOf('-n'); cmdLog(i >= 0 ? Number(rest[i + 1]) : undefined); break; }
  case 'compare': cmdCompare(); break;
  case 'init': cmdInit(); break;
  case 'replay': case 'undo': cmdReplayUndo(cmd, rest[0]); break;
  default:
    console.log('atomic — proof-chain CLI + governance\n  init [--force]            detect the repo + generate governance config\n  verify [<opId>|--head]    recompute the chain + check file state\n  explain <opId>            intention, proof, char diff, gate verdict\n  log [-n N]                walk the proof chain\n  compare                   run AtomicBench\n  replay|undo <opId>        (proof != content snapshot; see note)');
    process.exit(cmd ? 1 : 0);
}
