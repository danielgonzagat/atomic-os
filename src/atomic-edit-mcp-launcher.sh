#!/usr/bin/env bash
#
# Launch the atomic-edit MCP server (standalone build).
#
# Permanent design: NO tsx, NO npx, NO network. The server graph is compiled
# once to dist/ with the locally-installed `typescript`, then run as plain
# `node dist/server.js` (sub-second cold start, deterministic, upgrade-proof).
# It self-rebuilds ONLY when a source .ts is newer than dist/server.js, so it
# always reflects the latest source without a manual build step.
#
# stdout is reserved for the MCP stdio transport — this script prints nothing
# to stdout; build/diagnostic output goes to stderr only.
#
# Wire this path into your CLI's MCP config (see docs/INSTALL.md). The server
# operates on whatever git repo is the CURRENT working directory when your CLI
# launches it (guard.ts anchors to the nearest .git), so one install serves
# every project.

set -euo pipefail

# This launcher lives at <repo>/src/atomic-edit-mcp-launcher.sh
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"   # .../src
DIST="${SRC_DIR}/dist/server.js"

needs_build() {
  [[ ! -f "${DIST}" ]] && return 0
  local newest
  newest="$(find "${SRC_DIR}" -maxdepth 1 -name '*.ts' -newer "${DIST}" -print -quit 2>/dev/null || true)"
  [[ -n "${newest}" ]]
}

if needs_build; then
  echo "[atomic-edit-launcher] building dist (source changed)…" >&2
  node "${SRC_DIR}/build.mjs" >&2
fi

exec node "${DIST}" "$@"
