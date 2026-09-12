# DND — AGENTS.md

Instructions for agents working on this project. Details live in `docs/` — load only the files your task needs.

## How to use these docs

1. Find your task in the index below and read the listed file(s) before acting.
2. If the task spans topics, read each listed file.
3. `research_docs/` holds investigation notes (not normative); NOT to be read unless explicitly asked.
4. `docs/` wins on conflict.

## Index — read 'x' for 'x'

IMPORTANT: Read below files only if you need information about those topics.
| If you need … | Read |
|---|---|
| Run, build, install, or the common curl workflow | `docs/quickstart.md` |
| Project layout, backend conventions, env vars, paths | `docs/architecture.md` |
| Endpoint reference (methods, bodies) | `docs/api.md` |
| Agent lifecycle, HR registry, staffing, roles, models | `docs/systems/agents.md` |
| Harness discovery, native sessions, runners, dispatch rules | `docs/systems/harnesses.md` |
| Durable queue, dispatcher, `handleSendMessage`, SSE live sync | `docs/systems/messaging.md` |
| Tasks, task IDs, slugs, projects, project-manager invariant | `docs/systems/coordination.md` |
| MCP registry, permissions, invocation configs, Python env | `docs/systems/mcps.md` |
| React component map and UI rules | `docs/systems/frontend.md` |
| First run, boot, CEO model delegation | `docs/processes/startup.md` |
| Marshall, Analyst, boot reconciliation, intervals | `docs/processes/operations.md` |
| Test suites, live evals, golden regression fixtures | `docs/testing.md` |

## Universal rules

- Business logic lives in `src/backend/services/` and `src/backend/mcp/`; routes only validate, call services, and format responses.
- Verify with `npm test` (or the targeted suite) before finishing; keep tests deterministic and CLI/network-independent unless explicitly integration.
- Never add roster polling — roster sync is SSE (`docs/systems/messaging.md`).
- Never commit, push, or open PRs unless explicitly asked.
- IMPORTANT: Write Clean, Maintanable and Evolvable code. follow DRY principle.

## Updating docs after work

- After every change, update the affected `docs/` file(s) from the index above so the next session inherits the knowledge.
- Update `AGENTS.md` itself only when this index or the universal rules change (new topic, moved rule).
- Never silently drop a regression guard: golden fixtures under `tests/evals/fixtures/` stay until their failure mode is gone (see `docs/testing.md`).
