# System — harnesses (discovery, native sessions, runners)

## Discovery

The server auto-detects these CLI harnesses from the host system:

- **OpenCode** (`opencode`) — `opencode run --dir <project> "<prompt>"`
- **Claude Code** (`claude-code` / `claude`) — `claude -p --output-format json --resume <session-id>`
- **GitHub Copilot CLI** (`copilot`) — `copilot -p --allow-all-tools --output-format json --resume=<session-id>`
- **Codex** (`codex`)
- **Gemini CLI** (`gemini` / `gemini-cli`)
- **Ollama** (`ollama`) — if binary or `http://localhost:11434` HTTP endpoint

To refresh discovered models: call `POST /api/models/refresh`. This queries each harness binary for its available models and updates the in-memory registry.

If no harnesses are found, the system falls back to a virtual simulation harness (`system-simulator/balanced-agent`).

Model discovery per harness lives in `src/backend/harness/providers/<harness>.js` behind `initializeHarnessesAndModels` in `src/backend/harness/registry.js`; shared helpers (`findHarnessBinary`, `checkHttpEndpoint`, `buildModelCapability`) in `harness/common.js`, in-memory state in `harness/store.js`, role matching in `harness/selector.js`. Import from `src/backend/harness/index.js`.

## Native sessions (plan 01 continuation must prefer these over a custom loop)

`opencode run` supports `-c/--continue` + `-s/--session`, `codex exec` has `resume`/`fork`, `agy` has `-c/--continue` + `--conversation`, `claude` has `-r/--resume` + `--session-id`, `copilot` has `-r/--resume` + `--session-id`. `spawnHarnessAgent` resumes the agent's persisted session on every follow-up turn and only bootstraps a new session when no id is stored (or it went stale / the provider changed).

Session ids live on the HR record (`agent.harnessSessions`), so follow-up messages reuse the same native session even after a server restart. Resumed turns send a compact continuation prompt (`buildContinuationPrompt`: identity + new task + fresh MCP context) instead of re-injecting the full role bootstrap. CLIs are one-shot processes by design — "reuse" means resuming the server-side session, not keeping a process alive.

Per-harness wiring (all verified live unless noted):

- **OpenCode** (verified 2026-09-11): `--format json` + per-agent `-s`; stale-ID retry.
- **Codex** (verified 2026-09-11): `--json` + `exec resume <thread-id>` (`--skip-git-repo-check` always; `resume` reuses the thread cwd, no `--cd` — same-project resumes unaffected).
- **agy** (verified 2026-09-12): `--output-format json` + `--conversation <id>`; stale id warns and starts a fresh conversation — persist whatever id comes back.
- **Claude** (envelope verified 2026-09-12, recall unverified — no credits on this host — wiring is provisional): `-p --output-format json` + `--resume <id>`; new sessions get an explicit `--session-id` UUID; `is_error` turns fall back to the simulator so the dispatcher re-queues instead of consuming.
- **Copilot** (nonce recall verified 2026-09-12): `-p --allow-all-tools --output-format json` + `--resume=<id>` (JSONL: final `assistant.message` + closing `result` sessionId; stale id exits 0 with `No session, task, or name matched` on stderr — clear and retry once as new; new sessions get an explicit `--session-id` UUID, verified adopted).
- **gemini/ollama**: CLIs absent on this host → simulator fallback.

## Runners and dispatch rules

- **Harness runners**. Per-CLI adapters live in `src/backend/services/harnessRunner.js` (`spawnOpencodeAgent`, `spawnCodexAgent`, …) behind `spawnHarnessAgent`, which also builds/cleans the per-invocation MCP manifest via `src/backend/mcp/invocation.js`.
- **Harness prompt execution**. Pass agent prompts to harness CLIs as argument arrays (`execFileSync`), never by interpolating them into shell command strings; prompts can contain Markdown/code fences and shell metacharacters.
- **Harness CLI syntax is not interchangeable**. OpenCode uses `run ... --dir`; Codex uses `exec ... --cd` and requires the selected model via `--model`. Keep adapter-specific flags in their respective runner functions.
- **Custom harness workspaces**. Harness adapters must create an explicitly supplied non-global `workspaceDir` before using it as the child process `cwd`; otherwise Node reports `spawnSync ... ENOENT` before the harness can start.
- **Harness dispatch is asynchronous and event-completion based**. All CLI adapters use non-blocking child-process execution and remain alive until the harness exits or reports an error; do not add fixed model-duration timeouts. OpenCode especially must not use synchronous child execution because orchestration MCP calls back into the Node backend during the harness turn. Await `spawnHarnessAgent` at routes, services, scripts, and integration tests.
- **Harness observability and cancellation**. Harness lifecycle events (`harness_started`, `harness_output`, `harness_completed`, `harness_failed`, `harness_cancel_requested`) are emitted through the event bus with bounded output snippets. `cancelHarnessAgent(agentId)` is the explicit stop mechanism; elapsed time is not an implicit failure.
- **OpenCode agent permissions**. Dinah launches OpenCode agents with `opencode run --auto` so enabled MCP tools can run without interactive approval prompts. This applies only to Dinah-managed invocations; the temporary MCP config, per-agent token, and orchestration authorization checks remain in force.
- **OpenCode failure diagnostics**. OpenCode fallback results retain bounded stderr/stdout, exit status, signal, and error-code diagnostics so nested CLI/MCP failures are not reduced to a generic simulator message.
