# Governance — declaring your own protected files

Atomic OS ships with **two** safety layers:

1. **Path-escape boundary (always on, not configurable).** Every edit target
   must resolve inside the git repo root (or a registered git worktree, or a
   root you explicitly allow via `ATOMIC_EDIT_ALLOWED_ROOTS`). Nothing outside
   can ever be touched. This is a hard, unconditional guarantee.

2. **Protected-files set (you define it).** Exact paths / glob patterns that
   are hard-refused for *every* AI CLI edit, even inside the repo. This is for
   your governance / quality-infrastructure files (CI config, lint config,
   constitution docs, secrets modules, ledgers…).

The original deployment hardcoded a project-specific protected list. This
standalone build ships that set **empty by design** — you decide what is
sacred in *your* repo. Until you declare it, only layer 1 is enforced.

## Option A — JSON config (recommended)

Copy the example to the **root of the repo you want to protect** (not into
`atomic-os` itself):

```sh
cp /path/to/atomic-os/atomic-edit.protected.example.json \
   /path/to/YOUR-repo/atomic-edit.protected.json
```

Schema:

```json
{
  "files": ["CLAUDE.md", "infra/secrets.ts", ".github/workflows/ci.yml"],
  "globs": ["^ops/.+\\.json$", "^\\.github/workflows/.+$"]
}
```

- `files` — exact repo-relative paths (forward slashes).
- `globs` — JavaScript `RegExp` *source* strings, tested against the
  repo-relative path. Anchor with `^…$` for whole-path matches.

## Option B — environment variable

OS-path-delimited list (`:` on macOS/Linux, `;` on Windows), merged with the
JSON config if both are present:

```sh
export ATOMIC_EDIT_PROTECTED_FILES="CLAUDE.md:.github/workflows/ci.yml"
```

## Fail-safe behavior

- Missing config → protected set is empty; path-escape boundary still on.
- Malformed `atomic-edit.protected.json` → a stderr warning is printed and the
  protected set is treated as empty. **A broken config can never silently
  disable the path-escape boundary** — layer 1 is independent of layer 2.
- An invalid individual glob is skipped with a warning; the rest still load.

## When an edit hits a protected file

The tool refuses with, e.g.:

```
refused: CLAUDE.md is governance-protected (matched "CLAUDE.md").
Only the repo owner may change it — ask, do not bypass.
```

This is intentional and not overridable from inside an agent. If a protected
rule must change, a human changes the config — the agent asks, it does not
work around it. That asymmetry is a core invariant of the Atomic OS doctrine
(see `docs/knowledge/02-dehardcode-principle.md`).
