/**
 * Path safety guard for the atomic-edit MCP server (standalone / portable).
 *
 * The blunt built-in editors have no notion of repo governance — this server
 * ADDS that safety (strengthening, not weakening, the action space):
 *   - every target must resolve inside the repo root (no path escape);
 *   - files YOU declare as PROTECTED are read-only to any AI CLI and are
 *     refused here, hard.
 *
 * PORTABILITY NOTE (read this if you received atomic-os from someone else):
 * the original deployment hardcoded a project-specific protected set. This
 * standalone build ships that set EMPTY by design — you define your own.
 * Two ways, both optional, evaluated at process start:
 *
 *   1. Env var `ATOMIC_EDIT_PROTECTED_FILES` — OS-path-delimited list of
 *      repo-relative paths, e.g. on macOS/Linux:
 *        ATOMIC_EDIT_PROTECTED_FILES="CLAUDE.md:.github/workflows/ci.yml"
 *   2. A JSON file `atomic-edit.protected.json` at the repo root:
 *        { "files": ["CLAUDE.md", "infra/secrets.ts"],
 *          "globs": ["^ops/.+\\.json$", "^\\.github/workflows/.+$"] }
 *      `files` = exact repo-relative paths. `globs` = JS RegExp source tested
 *      against the repo-relative path (forward slashes).
 *
 * If neither is present, ONLY the path-escape boundary is enforced (still a
 * real, valuable guarantee: nothing outside the repo root can be touched).
 * Resolution is fail-safe: a malformed config is ignored with a stderr
 * warning rather than silently disabling the escape boundary.
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Anchor to the real repo root by walking up for a `.git` marker. Counting
 * fixed `../..` from this file is fragile: it breaks the moment the file runs
 * from a different depth (e.g. compiled into dist/ vs. source). Walking to the
 * marker is location-independent — correct under tsx (source) and node (dist).
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start, "..", "..", ".."); // last-resort
    dir = parent;
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = findRepoRoot(HERE);

function canonicalPath(target: string): string {
  const resolved = path.resolve(target);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function uniqueResolved(roots: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const root of roots) {
    if (root.trim().length === 0) continue;
    const resolved = canonicalPath(root);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(resolved);
  }
  return result;
}

function envAllowedRoots(): string[] {
  const value = process.env.ATOMIC_EDIT_ALLOWED_ROOTS;
  if (!value) return [];
  return value.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);
}

function gitWorktreeRoots(): string[] {
  try {
    const output = childProcess.execFileSync(
      "git",
      ["-C", REPO_ROOT, "worktree", "list", "--porcelain"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output
      .split(/\r?\n/)
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function allowedRepoRoots(): string[] {
  return uniqueResolved([REPO_ROOT, ...gitWorktreeRoots(), ...envAllowedRoots()]).sort(
    (a, b) => b.length - a.length,
  );
}

function containsPath(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function resolveAllowedRootForAbsolutePath(absPath: string): string | null {
  const abs = canonicalPath(absPath);
  return allowedRepoRoots().find((root) => containsPath(root, abs)) ?? null;
}

function resolveTargetRoot(file: string): { absPath: string; repoRoot: string } {
  const absPath = path.isAbsolute(file) ? canonicalPath(file) : canonicalPath(path.resolve(REPO_ROOT, file));
  const repoRoot = resolveAllowedRootForAbsolutePath(absPath);
  if (!repoRoot) {
    throw new Error(
      `refused: path escapes allowed atomic edit roots (${file}). ` +
        `Allowed roots: ${allowedRepoRoots().join(", ")}`,
    );
  }
  return { absPath, repoRoot };
}

/**
 * Owner-defined governance, resolved ONCE at module load.
 *
 * Empty by default in this standalone build. Populate via the
 * `ATOMIC_EDIT_PROTECTED_FILES` env var and/or an `atomic-edit.protected.json`
 * file at the repo root (see the file header for the schema). Resolution is
 * fail-safe: any error reading/parsing config is logged to stderr and the
 * config is treated as empty — it can never weaken the path-escape boundary.
 */
interface ProtectedConfig {
  files: Set<string>;
  globs: RegExp[];
}

function loadProtectedConfig(): ProtectedConfig {
  const files = new Set<string>();
  const globs: RegExp[] = [];

  const envList = process.env.ATOMIC_EDIT_PROTECTED_FILES;
  if (envList) {
    for (const entry of envList.split(path.delimiter)) {
      const trimmed = entry.trim();
      if (trimmed) files.add(trimmed.split(path.sep).join("/"));
    }
  }

  const configPath = path.join(REPO_ROOT, "atomic-edit.protected.json");
  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        files?: unknown;
        globs?: unknown;
      };
      if (Array.isArray(raw.files)) {
        for (const f of raw.files) {
          if (typeof f === "string" && f.trim()) {
            files.add(f.trim().split(path.sep).join("/"));
          }
        }
      }
      if (Array.isArray(raw.globs)) {
        for (const g of raw.globs) {
          if (typeof g === "string" && g.trim()) {
            try {
              globs.push(new RegExp(g));
            } catch {
              process.stderr.write(
                `[atomic-edit guard] ignoring invalid protected glob: ${g}\n`,
              );
            }
          }
        }
      }
    } catch (err) {
      process.stderr.write(
        `[atomic-edit guard] atomic-edit.protected.json unreadable, ` +
          `treating protected set as empty (path-escape boundary still ` +
          `enforced): ${(err as Error).message}\n`,
      );
    }
  }

  return { files, globs };
}

const PROTECTED = loadProtectedConfig();

/** Repo-relative path → the protection rule it matched, or null. */
function isProtectedRelative(rel: string): string | null {
  if (PROTECTED.files.has(rel)) return rel;
  for (const re of PROTECTED.globs) {
    if (re.test(rel)) return re.source;
  }
  return null;
}

export interface ResolvedTarget {
  absPath: string;
  relPath: string;
  repoRoot: string;
}

/**
 * Resolve a user-supplied path against an allowed repo root and assert it is
 * both contained and not governance-protected. Relative paths still target the
 * MCP server root. Absolute paths may target any registered git worktree for
 * this repo, which lets delegated workers operate in isolated worktrees without
 * mutating the coordinator's checkout.
 */
export function resolveSafeTarget(file: string): ResolvedTarget {
  const { absPath, repoRoot } = resolveTargetRoot(file);
  const rel = path.relative(repoRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`refused: path escapes resolved repo root (${file})`);
  }
  const relPath = rel.split(path.sep).join("/");
  const hit = isProtectedRelative(relPath);
  if (hit) {
    throw new Error(
      `refused: ${relPath} is governance-protected (matched "${hit}"). ` +
        `Only the repo owner may change it — ask, do not bypass. ` +
        `(Configure the protected set via ATOMIC_EDIT_PROTECTED_FILES or ` +
        `atomic-edit.protected.json at the repo root.)`,
    );
  }
  return { absPath, relPath, repoRoot };
}
