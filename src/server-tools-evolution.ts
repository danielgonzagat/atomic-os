/**
 * server-tools-evolution.ts — MCP tools that wire the evolution kernels
 * (disproof-corpus-harness, truth-funnel, experiment-harness) into the
 * Atomic OS MCP surface.
 *
 * These close the "Zero consumidores no engine" gap documented in
 * evolution/README.md. The kernels are built and proven; this file
 * is the PROMOTION PATH that makes them callable by agents.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { activeWorkspaceRoot } from './guard.js';
import { ok, fail } from './server-helpers-result.js';

function atomicSourceRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.basename(here) === 'dist' ? path.resolve(here, '..') : here;
}

/**
 * Lazy-load the evolution kernel — loaded once, cached forever.
 * The kernel is a .mjs file with pure-function exports; no side effects.
 */
let _disproofKernel: Record<string, (...args: unknown[]) => unknown> | null = null;
async function loadDisproofKernel(): Promise<Record<string, (...args: unknown[]) => unknown>> {
  if (_disproofKernel) return _disproofKernel;
  const kernelPath = path.join(atomicSourceRoot(), '..', 'evolution', 'disproof-corpus-harness.mjs');
  _disproofKernel = (await import(kernelPath)) as Record<string, (...args: unknown[]) => unknown>;
  return _disproofKernel;
}

// ── Corpus path management ──────────────────────────────────────────

function corpusPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.atomic', 'disproof-corpus.jsonl');
}

function readCorpus(workspaceRoot: string): string {
  const cp = corpusPath(workspaceRoot);
  if (!fs.existsSync(cp)) return '';
  return fs.readFileSync(cp, 'utf8');
}

function writeCorpus(workspaceRoot: string, text: string): void {
  fs.mkdirSync(path.dirname(corpusPath(workspaceRoot)), { recursive: true });
  fs.writeFileSync(corpusPath(workspaceRoot), text, 'utf8');
}

// ── Tool registration ───────────────────────────────────────────────

export function registerToolsEvolution(server: McpServer): void {
  server.registerTool(
    'atomic_evolution_verify_corpus',
    {
      title: 'Verify the disproof corpus integrity',
      description:
        'Verify the hash chain of the disproof corpus (.atomic/disproof-corpus.jsonl). ' +
        'Returns record count, wall count, wall summaries, and chain head. Every record ' +
        'is recomputable by third parties; a forged record is detected.',
      inputSchema: {},
    },
    async () => {
      const ws = activeWorkspaceRoot();
      const corpusText = readCorpus(ws);
      const kernel = await loadDisproofKernel();
      const result = kernel.verifyCorpusJsonl(corpusText) as {
        ok: boolean;
        recordCount?: number;
        wallCount?: number;
        headRecordSha256?: string | null;
        walls?: unknown[];
        error?: string;
      };
      if (!result.ok) {
        return fail(`Corpus integrity FAILED: ${result.error ?? 'unknown error'}`);
      }
      return ok({
        recordCount: result.recordCount ?? 0,
        wallCount: result.wallCount ?? 0,
        headRecordSha256: result.headRecordSha256 ?? null,
        wallKeys: (result.walls ?? []).slice(0, 20),
        corpusPath: corpusPath(ws),
      });
    },
  );

  server.registerTool(
    'atomic_evolution_append_witness',
    {
      title: 'Append a disproof witness to the evolution corpus',
      description:
        'Append a wall-hit or new-wall witness to the disproof corpus. Semantic dedup: ' +
        'if the wallKey already exists, it becomes a hitCount++ rather than a duplicate. ' +
        'The corpus is append-only, hash-chained, and third-party-recomputable.',
      inputSchema: {
        invariantId: z.string().describe('Invariant class id (e.g. "native-read")'),
        locus: z.string().describe('File path where the wall was hit'),
        region: z.string().optional().describe('Symbolic region (function/variable name)'),
        proposalDigest: z.string().describe('SHA256 of the proposal that hit the wall'),
        archiveEntrySha256: z.string().optional().describe('SHA256 of the archived proposal'),
        generation: z.number().int().min(0).optional().describe('Generation number (0-based)'),
      },
    },
    async (a) => {
      const ws = activeWorkspaceRoot();
      const corpusText = readCorpus(ws);
      const kernel = await loadDisproofKernel();
      const result = kernel.appendWitnessJsonl({
        corpusText,
        witnessArgs: {
          invariantId: a.invariantId,
          locus: a.locus,
          region: a.region ?? '',
          proposalDigest: a.proposalDigest,
          archiveEntrySha256: a.archiveEntrySha256 ?? '',
          generation: a.generation ?? 0,
        },
      }) as {
        ok: boolean;
        changed?: boolean;
        deduped?: boolean;
        corpusText?: string;
        error?: string;
        chain?: { wallCount?: number; recordCount?: number };
      };
      if (!result.ok) {
        return fail(`Failed to append witness: ${result.error ?? 'unknown error'}`);
      }
      if (result.corpusText) {
        writeCorpus(ws, result.corpusText);
      }
      return ok({
        changed: result.changed ?? false,
        deduped: result.deduped ?? false,
        chain: result.chain ?? null,
      });
    },
  );

  server.registerTool(
    'atomic_evolution_select_disproofs',
    {
      title: 'Select disproofs for a proposal briefing',
      description:
        'Given a file path (the edit target), select the most relevant disproof walls ' +
        'for the agent to review before proposing an edit. Priority 1: walls whose locus ' +
        'intersects the target. Priority 2: highest global hitCount.',
      inputSchema: {
        targetFile: z.string().describe('Repo-relative file path the agent will edit'),
        k: z.number().int().min(1).max(20).optional().describe('Max walls to return (default 5)'),
      },
    },
    async (a) => {
      const ws = activeWorkspaceRoot();
      const corpusText = readCorpus(ws);
      const kernel = await loadDisproofKernel();
      const result = kernel.selectDisproofs(
        a.targetFile,
        a.k ?? 5,
      ) as { walls: unknown[]; count: number };
      return ok({
        briefing: `Disproof walls relevant to ${a.targetFile}:`,
        walls: result.walls,
        count: result.count,
      });
    },
  );
}
