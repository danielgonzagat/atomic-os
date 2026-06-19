/**
 * engine-undo.ts — Per-operation undo/redo via chain-hash walker.
 *
 * The AtomicEditTrace already forms a tamper-evident chain (chainHashOf).
 * This module walks the ledger backward/forward, restoring exact byte states
 * operation by operation. Zero new infrastructure — it reuses the existing
 * .atomic/traces/ JSON files.
 *
 * Undo: load all traces for a file, find the one matching current content,
 *       restore the BEFORE state, delete the trace (operation undone).
 * Redo: replay the NEXT trace in the chain from the current state.
 *
 * Verifiable: each step's chainHash is recomputed and must match.
 *
 * Snapshot shapes: modern traces store byte snapshots in .atomic/snapshots and
 * point to them via snapshotPath. Legacy traces may still carry inline
 * snapshots/beforeSha256; this reader accepts both shapes and verifies hashes
 * before writing bytes back.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { snapshotText, type EditSnapshot } from './engine-proof-reexec.js';
import { chainHashOf, type AtomicEditTrace } from './trace.js';

export interface UndoResult {
  undone: boolean;
  operationId: string;
  operator: string;
  file: string;
  restoredChars: number;
}

export interface RedoResult {
  redone: boolean;
  operationId: string;
  operator: string;
  file: string;
}

type LegacyTrace = AtomicEditTrace & {
  beforeSha256?: string;
  snapshots?: { before?: string; after?: string };
};

const sha256 = (text: string): string => crypto.createHash('sha256').update(text).digest('hex');

function tracesDir(repoRoot: string): string {
  const primary = path.join(repoRoot, '.atomic', 'traces');
  if (fs.existsSync(primary)) return primary;
  return path.join(repoRoot, 'traces');
}

function loadTrace(repoRoot: string, id: string): LegacyTrace | null {
  const tracePath = path.join(tracesDir(repoRoot), `${id}.json`);
  if (!fs.existsSync(tracePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(tracePath, 'utf8')) as LegacyTrace;
  } catch {
    return null;
  }
}

function deleteTrace(repoRoot: string, id: string): void {
  try {
    fs.unlinkSync(path.join(tracesDir(repoRoot), `${id}.json`));
  } catch {
    // Best effort: undo already restored the bytes.
  }
}

/**
 * Load the before/after content snapshot a trace points at. Current traces carry a
 * repo-relative `snapshotPath` (.atomic/snapshots/<op>.snap.json) rather than inline
 * content; the EditSnapshot there is content-addressed (beforeSha256/afterSha256) and read
 * through `snapshotText()` (handles both legacy raw and gzip-base64 encodings). Returns null
 * for preview/legacy traces with no snapshot — undo/redo then degrades to "nothing to restore".
 */
function loadSnapshot(repoRoot: string, trace: LegacyTrace): EditSnapshot | null {
  if (!trace.snapshotPath) return null;
  const snapshotPath = path.isAbsolute(trace.snapshotPath) ? trace.snapshotPath : path.join(repoRoot, trace.snapshotPath);
  if (!fs.existsSync(snapshotPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as EditSnapshot;
  } catch {
    return null;
  }
}

/**
 * Resolve the textual content for one side of a trace. Prefers the modern
 * content-addressed snapshot (read via `snapshotText()`); falls back to a
 * legacy inline `snapshots.before/after` string when present. Returns null when
 * neither shape yields content.
 */
function readSide(repoRoot: string, trace: LegacyTrace, side: 'before' | 'after'): string | null {
  const snapshot = loadSnapshot(repoRoot, trace);
  if (snapshot) {
    try {
      return snapshotText(snapshot, side);
    } catch {
      return null;
    }
  }
  const legacy = trace.snapshots?.[side];
  return typeof legacy === 'string' ? legacy : null;
}

/**
 * Resolve the expected sha256 for one side of a trace, from the modern snapshot
 * if available, otherwise from the legacy trace fields.
 */
function snapshotHash(repoRoot: string, trace: LegacyTrace, side: 'before' | 'after'): string | null {
  const snapshot = loadSnapshot(repoRoot, trace);
  if (snapshot) return side === 'before' ? snapshot.beforeSha256 : snapshot.afterSha256;
  if (side === 'before') return trace.beforeSha256 ?? null;
  return trace.afterSha256;
}

/** Recompute and verify the trace's tamper-evident chain hash. */
function chainIsValid(trace: LegacyTrace): boolean {
  return chainHashOf(trace.parentSha256, trace.afterSha256, trace.gateVerdict) === trace.chainHash;
}

/**
 * Undo the last operation on a file. Finds the trace whose `afterSha256`
 * matches the file's current content, restores the `before` snapshot,
 * and removes the trace from the ledger.
 */
export function undoLast(repoRoot: string, file: string): UndoResult | null {
  const absPath = path.isAbsolute(file) ? file : path.join(repoRoot, file);
  if (!fs.existsSync(absPath)) return null;

  const currentContent = fs.readFileSync(absPath, 'utf8');
  const currentHash = sha256(currentContent);
  const dir = tracesDir(repoRoot);
  if (!fs.existsSync(dir)) return null;

  // Find the trace whose afterSha256 matches current content
  const files = fs.readdirSync(dir).filter((entry) => entry.endsWith('.json')).sort().reverse();
  for (const entry of files) {
    const trace = loadTrace(repoRoot, entry.replace(/.json$/, ''));
    if (!trace || trace.afterSha256 !== currentHash || !chainIsValid(trace)) continue;

    const beforeContent = readSide(repoRoot, trace, 'before');
    const beforeHash = snapshotHash(repoRoot, trace, 'before');
    if (beforeContent === null || !beforeHash || sha256(beforeContent) !== beforeHash) continue;

    const absTarget = path.isAbsolute(trace.file) ? trace.file : path.join(repoRoot, trace.file);
    // Restore before state
    fs.writeFileSync(absTarget, beforeContent, 'utf8');
    // Verify restoration against the snapshot's content-addressed before-hash
    if (sha256(fs.readFileSync(absTarget, 'utf8')) !== beforeHash) {
      // Restoration failed — revert
      fs.writeFileSync(absTarget, currentContent, 'utf8');
      return null;
    }

    deleteTrace(repoRoot, trace.operationId);
    return {
      undone: true,
      operationId: trace.operationId,
      operator: trace.operator,
      file: trace.file,
      restoredChars: beforeContent.length,
    };
  }

  return null;
}

/**
 * Redo: find the next trace in the chain whose beforeSha256 matches
 * the current content, apply the after state.
 */
export function redoNext(repoRoot: string, file: string): RedoResult | null {
  const absPath = path.isAbsolute(file) ? file : path.join(repoRoot, file);
  if (!fs.existsSync(absPath)) return null;

  const currentHash = sha256(fs.readFileSync(absPath, 'utf8'));
  const dir = tracesDir(repoRoot);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter((entry) => entry.endsWith('.json')).sort();
  for (const entry of files) {
    const trace = loadTrace(repoRoot, entry.replace(/.json$/, ''));
    if (!trace || !chainIsValid(trace)) continue;

    const beforeHash = snapshotHash(repoRoot, trace, 'before');
    if (beforeHash !== currentHash) continue;

    const afterContent = readSide(repoRoot, trace, 'after');
    const afterHash = snapshotHash(repoRoot, trace, 'after');
    if (afterContent === null || !afterHash || sha256(afterContent) !== afterHash) continue;

    const absTarget = path.isAbsolute(trace.file) ? trace.file : path.join(repoRoot, trace.file);
    fs.writeFileSync(absTarget, afterContent, 'utf8');
    if (sha256(fs.readFileSync(absTarget, 'utf8')) !== afterHash) return null;

    return {
      redone: true,
      operationId: trace.operationId,
      operator: trace.operator,
      file: trace.file,
    };
  }

  return null;
}

/**
 * Generate a conventional commit message from an operation trace.
 */
export function commitMessageFromTrace(trace: AtomicEditTrace): string {
  const type = trace.operator.startsWith('atomic_rename') ? 'refactor' :
    trace.operator.includes('delete') || trace.operator.includes('remove') ? 'chore' :
    trace.operator.includes('create') ? 'feat' :
    'fix';
  const file = trace.file.split('/').pop() ?? trace.file;
  const expansion = trace.metrics?.expansionFactorAvoided ?? 1;
  const scope = expansion > 1 ? ` (${expansion}x sub-line)` : '';
  return `${type}: ${trace.operator.replace('atomic_', '')} ${file}${scope}`;
}
