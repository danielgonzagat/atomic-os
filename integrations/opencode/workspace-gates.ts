/**
 * Atomic OS — OpenCode enforcement plugin (genericized / portable).
 *
 * This is the OpenCode equivalent of the Claude Code `atomic-only-hook.mjs`
 * PreToolUse gate: it intercepts every code-mutating tool call OpenCode makes
 * (and every spawned subagent inherits it) and routes it through the SHARED
 * `atomic-only-hook.mjs`, so native/shell code edits are denied and only the
 * atomic-edit MCP tools may mutate code. One law, three CLIs.
 *
 * The original deployment also chained project-specific workspace gates
 * (KLOEL `scripts/decomp/*`). Those were NOT part of the Atomic OS and have
 * been removed from this portable build — this plugin enforces ONLY the
 * atomic-edit law. Add your own project gates back if you want them.
 *
 * Resolution of the shared hook (first hit wins):
 *   1. env `ATOMIC_OS_HOME`            → $ATOMIC_OS_HOME/src/atomic-only-hook.mjs
 *   2. a co-located copy               → <this dir>/../../src/atomic-only-hook.mjs
 *   3. in-repo install                 → <repoRoot>/atomic-os/src/atomic-only-hook.mjs
 * If none is found the gate is a safe no-op (it never fails open silently on
 * a malformed response — only on a genuinely absent install).
 *
 * Install: copy to `.opencode/plugins/workspace-gates.ts` in the repo you want
 * gated (OpenCode auto-loads `.opencode/plugins/*.ts`), and set
 * `ATOMIC_OS_HOME` to your atomic-os checkout. See integrations/opencode/README.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from '@opencode-ai/plugin';

type ToolArgs = Record<string, unknown>;
type HookInput = {
  call?: { name?: string; input?: ToolArgs };
  tool?: string;
  args?: ToolArgs;
};
type HookOutput = { args?: ToolArgs };

const TOOL_MAP: Record<string, string> = {
  bash: 'Bash',
  Bash: 'Bash',
  write: 'Write',
  Write: 'Write',
  edit: 'Edit',
  Edit: 'Edit',
  multiedit: 'MultiEdit',
  MultiEdit: 'MultiEdit',
  notebookedit: 'NotebookEdit',
  NotebookEdit: 'NotebookEdit',
  patch: 'apply_patch',
  Patch: 'apply_patch',
};

const ATOMIC_GATED_TOOLS = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Bash',
  'apply_patch',
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/** Locate the shared atomic-only-hook.mjs across the supported layouts. */
function resolveAtomicHook(repoRoot: string): string | null {
  const candidates = [
    process.env.ATOMIC_OS_HOME
      ? path.join(process.env.ATOMIC_OS_HOME, 'src', 'atomic-only-hook.mjs')
      : '',
    path.resolve(HERE, '..', '..', 'src', 'atomic-only-hook.mjs'),
    path.join(repoRoot, 'atomic-os', 'src', 'atomic-only-hook.mjs'),
  ].filter(Boolean);
  return candidates.find((c) => existsSync(c)) ?? null;
}

function normalizeOpenCodeArgs(args: ToolArgs): ToolArgs {
  const normalized = { ...args };
  if (normalized.filePath && !normalized.file_path) normalized.file_path = normalized.filePath;
  if (normalized.path && !normalized.file_path) normalized.file_path = normalized.path;
  return normalized;
}

function runAtomicGate(hookPath: string, payload: object): { deny: boolean; reason: string } {
  const result = spawnSync('node', [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  try {
    const out = JSON.parse(result.stdout || '{}');
    const decision = out?.hookSpecificOutput;
    if (decision?.permissionDecision === 'deny') {
      return {
        deny: true,
        reason: String(decision.permissionDecisionReason || 'native code edit banned'),
      };
    }
  } catch {
    throw new Error('OpenCode atomic gate returned malformed JSON; refusing tool execution.');
  }
  return { deny: false, reason: '' };
}

function buildEnvelope(input: HookInput, output: HookOutput) {
  const rawName = input?.call?.name ?? input?.tool ?? '';
  const claudeName = TOOL_MAP[rawName] ?? rawName;
  const args = normalizeOpenCodeArgs(output?.args ?? input?.call?.input ?? input?.args ?? {});
  return {
    claudeName,
    envelope: { tool_name: claudeName, tool_input: args },
  };
}

export const WorkspaceGatesPlugin: Plugin = async ({ directory, worktree }) => {
  const repoRoot = findRepoRoot(worktree || directory || process.cwd());
  const atomicHook = resolveAtomicHook(repoRoot);

  return {
    'tool.execute.before': async (input: HookInput, output: HookOutput) => {
      if (!atomicHook) return; // atomic-os not installed → safe no-op
      const { claudeName, envelope } = buildEnvelope(input, output);
      if (ATOMIC_GATED_TOOLS.has(claudeName)) {
        const atomic = runAtomicGate(atomicHook, envelope);
        if (atomic.deny) throw new Error(atomic.reason);
      }
    },
  };
};

export default WorkspaceGatesPlugin;
