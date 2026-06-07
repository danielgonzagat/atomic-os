# AtomicBench — measured, reproducible (run `node src/bench.mjs`)

## Expansion avoided — bytes Atomic OS changed vs a line-rewrite / file-rewrite of the same edit

| Language | Atomic bytes | Line-rewrite bytes | File-rewrite bytes | Avoided vs line | Avoided vs file |
|---|--:|--:|--:|--:|--:|
| Python | 1 | 58 | 96 | 98.3% | 99.0% |
| JavaScript | 1 | 52 | 112 | 98.1% | 99.1% |
| TypeScript | 1 | 52 | 128 | 98.1% | 99.2% |
| Go | 1 | 55 | 102 | 98.2% | 99.0% |
| Rust | 1 | 56 | 94 | 98.2% | 98.9% |
| Java | 1 | 59 | 113 | 98.3% | 99.1% |
| **TOTAL (6/6)** | **6** | **332** | **645** | **98.2%** | **99.1%** |

## Safety — every coarse/destructive action MUST be refused

| Guarantee | Result |
|---|---|
| negative-byte edit refused without proofOfIncorrectness | PASS — refused |
| path-escape (write outside repo) refused | PASS — refused |
| syntax-breaking edit refused (no bad write) | PASS — refused/safe |
| every applied edit left a replayable trace | PASS — 6 traces |

> Method: each task makes ONE correction; "Atomic bytes" is the minimal changed span
> (common-prefix/suffix stripped), "Line-rewrite" is the length of the line(s) a line editor
> rewrites, "File-rewrite" is the whole file a "rewrite-and-trust" agent re-emits. Baselines are
> computed from the same edit, not claimed. Server is the live MCP in a temp workspace.
