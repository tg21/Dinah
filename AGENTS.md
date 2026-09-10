# DND — AGENTS.md

Compact instruction file for OpenCode sessions. Every line answers: "Would an agent likely miss this without help?"

---

# Important: Always update AGENTS.md when relevant after every change

## 1. Quickstart

| Action | Command |
|---|---|
| Start the backend server | `node src/backend/server.js` or `npm start` |
| Install backend, frontend, and orchestration MCP dependencies | `./setup.sh` |
| Start backend + React dev server | `npm run dev` (backend `:2121` + Vite `:5173` with `/api` proxy) |
| Start React dev server only | `npm run dev:frontend` (needs backend on `:2121`) |
| Open the web UI (prod bundle) | Browse to `http://localhost:2121` |
| Open the web UI (hot-reload dev) | Browse to `http://localhost:5173` |
| Refresh harness/model discovery | `POST /api/models/refresh` or call `initializeHarnessesAndModels(true)` |

When running from another directory, launch with the tool entry path (for example
`node /path/to/dinah/src/backend/server.js`) while keeping the shell in the
desired user workspace. That directory becomes the workspace and receives
`.dinah`, `projects/`, `hr-system/`, `shared-state/`, and `user-mcps/`.

---

## 2. Project Structure

| Directory | Contents |
|---|---|
| `src/backend.js` | Deprecated shim — re-exports `src/backend/server.js` for backward compatibility |
| `src/backend/` | Modular Express server: `server.js` (listen/init), `app.js` (middleware + router mounting + React bundle static hosting with SPA fallback), `config.js` (tool-root/working-directory detection and paths), `routes/` (one `express.Router()` per domain: `projects`, `models`, `mcps`, `agents`, `messages`, `knowledge`, `marshall`, `system`), `services/` (`hrService`, `projectService`, `messageService`, `eventBus`, `harnessRunner`, `agentLifecycle`, `startupService`, `knowledgeService`, `marshallService`), `mcp/` (`registry`, `catalog`, `permissions`, `invocation`), `harness/` (detection/discovery: `registry` orchestrator, `common` shared helpers, `store` in-memory state, `selector` role matching, `providers/` one module per harness: `opencode`, `antigravity`, `ollama`, `claude`, `gemini`, `codex`, `simulator`), `data/rpgRegistry.js` (agent RPG stats + thought pools) |
| `src/frontend/` | Vite + React 18 UI (own `package.json`, `vite.config.js`, `index.html`): `src/main.jsx` entry, `src/App.jsx` shell, `src/api/client.js` (all backend fetch calls), `src/store/AppContext.jsx` (global agent/project/model/MCP/modal state), `src/constants/` (`roles.js` ROLE_CONFIGS + roster, `startup.js` labels/effort/quick prompts), `src/utils/` (`format.js` escaping + 900-char collapse, `cost.js` spawn estimate + model grouping), `src/components/Layout/` (`TopNav`, `ExecutiveBar`), `src/components/PlayArea/` (`PlayArea.jsx`, `engine.js` 2D canvas world/sprites/couriers/camera), `src/components/Drawer/` (`Drawer` + `ChatTab`, `StatsTab`, `ThoughtsTab`, `ContextTab`, `BrainView` three.js, `NetworkTab`), `src/components/Modals/` (`Modal` shell + `StartupSetup`, `NewProject`, `ProjectSettings`, `SpawnAgent`, `AgentEdit`, `McpManagement`, `KnowledgeBase`, `MarshallAudit`), `src/styles/global.css` (theme ported from legacy HTML) |
| `src/` (other) | `harnessRegistry.js` (deprecated shim — re-exports `src/backend/harness/index.js`) |
| `working-area/` | Default mutable user workspace created when launched from the tool repository; contains `hr-system/`, `projects/`, `shared-state/`, `user-mcps/`, and `.dinah` |
| `mcp/` | Shipped MCP registry and server packages tracked by git; never write UI-installed MCPs here |
| `agent-templates/` | JSON role definitions; each file is named for its role and contains `name`, `job`, and `basePrompt` (shipped/read-only) |
| `prompts/` | Shipped system prompts (read-only) |

---

## 3. API Endpoints — Most Frequently Needed

| Endpoint | Method | Description |
|---|---|---|
| `/api/agents` | GET | View active agent roster (loads `hr-system.json`) |
| `/api/models` | GET | View available AI harnesses and models |
| `/api/harnesses` | GET | View detected harnesses only |
| `/api/agents/request-summon` | POST | Place agent in `awaiting-confirmation` state. Body: `{ role, projectId?, name?, model?, harness?, effortLevel? }` |
| `/api/agents/confirm-summon` | POST | Manifest agent from `awaiting-confirmation` to `active`. Body: `{ agentId, updatedParams? }` |
| `/api/agents/spawn` | POST | Spawn agent directly as `active` (bypasses confirmation). Body: `{ role, projectId?, customName?, model?, harness?, effortLevel? }` |
| `/api/agents/update` | POST | Update agent name, model, harness, effortLevel, prompt, stats. Body: `{ agentId, updates }` |
| `/api/agents/set-status` | POST | Set agent status (`active`/`working`/`paused`/`retired`). Body: `{ agentId, status }` |
| `/api/marshall/run` | POST | Run Marshall Sentinel manual audit (context exhaustion, stuck processes, obsolete cleanup). |
| `/api/marshall/audit` | GET | View last Marshall audit report. |
| `/api/knowledge-base` | GET | View company knowledge base. |
| `/api/knowledge-base/run-analyst` | POST | Run Senior Analyst Diviner inspection (5-min synth cycle). |
| `/api/events` | GET | View agent event stream (courier animation). |
| `/api/projects` | GET | List all projects and their configs. |

---

## 4. Agent Lifecycle — Critical Rules

1. **HR Mind Flayer is the sole spawner**. Only the `hr-mind-flayer` agent (or API calls targeting HR) may create/modify agents.
2. **Summoning creates `awaiting-confirmation` state**. Use `POST /api/agents/request-summon` → agent appears in UI with "awaiting confirmation" badge → confirm via `POST /api/agents/confirm-summon`.
3. **Direct spawn creates `active` state**. Use `POST /api/agents/spawn` to immediately create an active agent.
4. **Marshall Sentinel runs every 5 minutes** automatically. Manually trigger with `POST /api/marshall/run`. It checks:
   - Context exhaustion (>90% used) → generates handover document
   - Stuck processes (>10 min idle in `working` status) → resets to `active`
   - Obsolete agents (tasks_completed >= tasks_total) → marks `obsolete`
5. **Senior Analyst Diviner runs every 5 minutes** automatically. Manually trigger with `POST /api/knowledge-base/run-analyst`. It synthesizes project telemetry into the knowledge base.
6. **Agent statuses**: `active`, `working`, `paused`, `awaiting-confirmation`, `obsolete`. Setting `paused` skips both Marshall and Senior Analyst cycles for that agent.

---

## 5. Harness & Model Discovery

The server auto-detects these CLI harnesses from the host system:

- **OpenCode** (`opencode`) — `opencode run --dir <project> "<prompt>"`
- **Claude Code** (`claude-code` / `claude`)
- **Codex** (`codex`)
- **Gemini CLI** (`gemini` / `gemini-cli`)
- **Ollama** (`ollama`) — if binary or `http://localhost:11434` HTTP endpoint

To refresh discovered models: call `POST /api/models/refresh`. This queries each harness binary for its available models and updates the in-memory registry.

If no harnesses are found, the system falls back to a virtual simulation harness (`system-simulator/balanced-agent`).

---

## 6. Build & Scripts

| Script | Effect |
|---|---|
| `npm start` | Runs `node src/backend/server.js` (serves the `dist/frontend/` React bundle; `/` returns 503 with build instructions when the bundle is missing) |
| `npm run dev` | Runs backend + Vite dev server concurrently (needs `concurrently`; installs via root devDeps) |
| `npm run dev:backend` | Runs backend only on `:2121` |
| `npm run dev:frontend` | Runs Vite hot-reload UI on `:5173` with `/api` + `/handle*` proxied to `:2121`; needs `npm run install:frontend` first |
| `npm run install:frontend` | Installs `src/frontend/` deps (`react`, `react-dom`, `three`, `vite`, `@vitejs/plugin-react`) |
| `npm run fresh-start` | Deletes the default `working-area/`, then starts `node src/backend/server.js`; use only when a full runtime-state reset is intended |
| `npm run build` | Builds backend bundle into `dist/backend/` (`build:backend`) AND React UI into `dist/frontend/` (`build:frontend`) |
| `npm run build:backend` | Copies the modular backend (`src/backend/server.js`, `app.js`, `config.js`, `routes/`, `services/`, `mcp/`, `harness/`, `data/`) and JSON `agent-templates/` plus the `src/backend.js` and `src/harnessRegistry.js` shims into `dist/` |
| `npm run build:frontend` | Runs `vite build` in `src/frontend/` → emits static assets to `dist/frontend/` (served by `src/backend/app.js`) |
| `npm test` | Runs the Vitest suite once |
| `npm run test:watch` | Runs Vitest in watch mode during development |
| `npm run test:coverage` | Runs Vitest with V8 coverage reporting |
| `npm run eval -- --harness <name> --model <id>` | Runs live trajectory/outcome evals with a selected harness/model and saves results under `eval-results/` |
| `npm run test:all -- --harness <name> --model <id>` | Runs normal tests, then live evals |

No lint or typecheck configured. Root uses `type: "module"`; `src/frontend/` is a separate Vite package (`dnd-frontend`) with its own `package.json`.

## 7.5 Testing & Golden Regression Cases

- Tests live under `tests/backend/` for backend/service behavior, `tests/agents/` for agent-specific checks, and `tests/evals/` for evaluator sanity checks plus live-eval contracts.
- Vitest is the root test runner. Keep tests deterministic and independent of installed harness CLIs, API keys, network access, and mutable runtime state unless a test explicitly opts into an integration environment.
- Live trajectory evals check ordered agent behavior such as manager planning, staffing, dispatch, review, QA, and acceptance. Live outcome evals check user-facing results and HITL transitions such as `ask_user` → `awaiting-user` → user reply → resume. The deterministic tests in `tests/evals/evaluator-sanity.test.js` only verify evaluator logic; they are not evidence that an agent performs well.
- When a real failure is found, preserve the smallest useful trace as a JSON fixture under `tests/evals/fixtures/` and add an assertion that reproduces it before fixing the implementation. These fixtures form the golden regression set; do not remove one merely because the implementation now passes.
- Golden traces should contain only stable, non-secret event data. Redact prompts, credentials, personal data, and large logs; store the invariant event type, actor, relevant status, and expected result instead.
- Every new regression fixture should include the failure it prevents and be exercised by the live eval runner; evaluator sanity checks should remain in `npm test` so evaluator changes cannot silently break regression detection.
- Live evals are opt-in and use `npm run eval -- --harness <name> --model <id> [--eval manager-trajectory|hitl-outcome|all] [--refresh]`. Running `npm run eval` without selection arguments opens an interactive harness/model/eval selector when a TTY is available; CI and other non-TTY callers must provide explicit flags. Use `--help` or `--list-models` to inspect options. The runner asks the selected manager model for a JSON event trace, evaluates it against the golden contract, and writes one result file per test.
- The manager integration eval must handle HITL pauses: when the manager enters `awaiting-user`, the isolated runner submits a deterministic scope reply through `/handleSendMessage` so the real resume transition and follow-up harness turn are exercised.
- `tests/evals/manager-trajectory.integration.test.js` is the deterministic orchestration integration contract: it exercises real HR, task, progress, messaging, and harness-dispatch services in isolated state. It is distinct from the live model trace eval and does not require a harness CLI or network.
- `npm run eval:integration -- --harness <name> --model <id> [--effort Low|Medium|High|Extreme]` runs the opt-in LLM-driven manager integration trajectory. It starts an isolated backend, invokes the selected manager model, and uses reusable fake collaborators from `tests/evals/helpers/fakeAgents.js` to advance HR, worker, and QA state between manager turns. Its result is authoritative backend-state evidence, not a model-authored event trace. The per-turn collaboration policy (plan detection, multi-role staffing, implementation-task selection, review/acceptance matching, QA targeting) lives in `tests/evals/helpers/integrationDriver.js` with regression coverage in `tests/evals/manager-integration-driver.test.js`.
- The LLM integration runner fails closed if the selected harness falls back to the simulator; simulated output is never accepted as manager behavior.
- The current OpenCode integration failure and follow-up hypotheses are documented in `research_docs/opencode-manager-integration-eval-investigation.md`; preserve fail-closed behavior while investigating permission-bypass flags and MCP startup diagnostics.
- The isolated manager integration prompt omits the shipped tool-root path so the selected model cannot escape into or inspect the core repository; only the temporary project workspace is presented as its workspace.
- Each live eval invokes the harness from a temporary isolated evaluation workspace, never the core project workspace; the workspace is removed after the scenario and the raw model response is retained in `eval-results/`. Event extraction accepts a valid JSON trace embedded in a short preamble, suffix, or markdown fence, while the contract evaluator still checks ordered event types and actors.
- Eval prompts ask the model to simulate tool and HITL transitions as JSON events; they must not ask the live user, pause for input, or inspect MCP manifest files.
- `eval-results/` is intentionally ignored by git. Result filenames include model, harness, test name, and timestamp; result JSON also records the raw response, parsed events, pass/fail status, timing, whether the harness fell back to simulation, and evaluation failures. Do not place secrets in prompts or result output.

---

## 7. Key Conventions & Gotchas

- **Frontend hosting**. `src/backend/app.js` serves the Vite build from `dist/frontend/` (fallback `src/frontend/dist/`) with an SPA fallback for non-`/api` GETs. The React app in `src/frontend/` is the only UI — there is no raw-HTML fallback. After editing `src/frontend/`, run `npm run build:frontend` before testing the `:2121` UI, or use `npm run dev:frontend` (`:5173`, proxies `/api` + `/handle*` to `:2121`) for hot reload. New UI code goes in `src/frontend/src/` (API calls in `api/client.js`, shared state in `store/AppContext.jsx`).
- **Port**: Server defaults to `2121` (`PORT` env var supported).
- **CORS**: Enabled for all origins.
- **Working directory detection**. `src/backend/config.js` derives the shipped tool root from the module location. When launched from the tool repository, mutable state is placed in `working-area/`; when launched from any other directory, that directory itself is the working area. A `.dinah` marker is created/read in the working area, and `/api/system/workspace` exposes the resolved paths.
- **Backend startup ordering**. `src/backend/server.js` listens on the configured port before harness/model discovery so the Vite proxy can connect while initialization is still running.
- **HR registry is the source of truth**. `<working-area>/hr-system/hr-system.json` dictates active agents, their models, harnesses, context limits, and statuses. The UI reads from this file. HR persistence lives in `src/backend/services/hrService.js`.
- **Project directories are auto-created**. `createProjectFolder(projectId)` in `src/backend/services/projectService.js` creates `<working-area>/projects/<id>/` with a `README.md` if missing.
- **Route/service ownership**. Business logic lives in `src/backend/services/` and `src/backend/mcp/`; `src/backend/routes/*.js` files only validate input, call services, and format responses. Wire new endpoints as an `express.Router()` in `routes/` and mount it in `src/backend/app.js`.
- **Harness runners**. Per-CLI adapters live in `src/backend/services/harnessRunner.js` (`spawnOpencodeAgent`, `spawnCodexAgent`, …) behind `spawnHarnessAgent`, which also builds/cleans the per-invocation MCP manifest via `src/backend/mcp/invocation.js`.
- **Agent definitions**. `src/backend/services/agentDefinitions.js` validates and loads `agent-templates/<role>.json`, then injects the role prompt and runtime workspace context into every harness invocation. Role definitions must not contain hardcoded API URLs or curl commands.
- **Agent coordination**. The shipped `dinah-orchestration` MCP exposes project status, HR staffing requests, task dispatch with acceptance criteria/dependencies, progress, blockers, help requests, and durable agent messages. State is stored in `shared-state/coordination.json`; agents must publish progress, report blockers, and request help instead of relying on periodic full-project scans.
- **Task assignee identity**. Managers may assign by roster role name or concrete agent ID; coordination canonicalizes a unique project role to its project-scoped agent ID. The task creator may publish coordination progress for delegated work, and the assigned worker may publish execution progress; unrelated agents remain rejected.
- **Agent messaging**. `shared-state/message-queue.json` is the durable source of truth for direct/project messages, delivery leases, acknowledgements, retries, and dead letters; `agent-*.msgs.json` remains a UI/audit projection. Use the `dinah-orchestration` inbox/claim/acknowledge/complete/fail/release tools for delivery, and treat `send_agent_message` as queue acceptance only. The backend dispatcher wakes one active agent at a time with a bounded inbox batch and recovers expired leases.
- **Message status identifiers**. `get_message_status` accepts either the durable `messageId` or the `deliveryId` returned by inbox/claim responses; lease-mutating tools still require the message ID and lease token.
- **Messaging observability UI**. The drawer's Messages tab reads `/api/message-activity`; current-project messages render as cascaded incoming/outgoing bubbles with queued/claimed/processing/completed/dead-letter ticks. `/api/events` emits `courier_message` events, which the play area renders as clickable mail flights for 30 seconds; keep event payloads populated with `messageId`, `deliveryId`, `projectId`, sender, recipient, and summary.
- **Staffing authority**. Managers use `request_staff`; only `hr-mind-flayer` may use `provision_agent`. Both support model, harness, effort, and `promptOverride` specialization parameters, and the backend enforces the HR boundary.
- **Model routing and specialization**. Each role definition contains `modelPolicy`, `runtimeCustomization`, and `coordination` metadata. HR/model selection uses the policy when choosing discovered models; staffing requests may provide a model override and a specialization prompt override, which is included in the invocation without replacing the core role prompt.
- **Harness discovery**. Model discovery per harness lives in `src/backend/harness/providers/<harness>.js` behind `initializeHarnessesAndModels` in `src/backend/harness/registry.js`; shared helpers (`findHarnessBinary`, `checkHttpEndpoint`, `buildModelCapability`) in `harness/common.js`, in-memory state in `harness/store.js`, role matching in `harness/selector.js`. Import from `src/backend/harness/index.js`.
- **MCP separation**. `mcp/registry.json` and `mcp/servers/` are shipped, git-tracked MCPs. UI-installed MCPs are written to `<working-area>/user-mcps/`; `GET /api/mcps` combines both inventories and labels each entry with `sourceType`.
- **Default orchestration MCP**. The shipped `dinah-orchestration` MCP is enabled for every agent invocation by default and is displayed as enabled in the UI even when older HR records have no persisted `mcp` entry. OpenCode receives a native temporary config through `OPENCODE_CONFIG`; other harnesses use the internal invocation manifest.
- **OpenCode agent permissions**. Dinah launches OpenCode agents with `opencode run --auto` so enabled MCP tools can run without interactive approval prompts. This applies only to Dinah-managed invocations; the temporary MCP config, per-agent token, and orchestration authorization checks remain in force.
- **OpenCode failure diagnostics**. OpenCode fallback results retain bounded stderr/stdout, exit status, signal, and error-code diagnostics so nested CLI/MCP failures are not reduced to a generic simulator message.
- **Custom harness workspaces**. Harness adapters must create an explicitly supplied non-global `workspaceDir` before using it as the child process `cwd`; otherwise Node reports `spawnSync ... ENOENT` before the harness can start.
- **Harness dispatch is asynchronous and event-completion based**. All CLI adapters use non-blocking child-process execution and remain alive until the harness exits or reports an error; do not add fixed model-duration timeouts. OpenCode especially must not use synchronous child execution because orchestration MCP calls back into the Node backend during the harness turn. Await `spawnHarnessAgent` at routes, services, scripts, and integration tests.
- **Harness observability and cancellation**. Harness lifecycle events (`harness_started`, `harness_output`, `harness_completed`, `harness_failed`, `harness_cancel_requested`) are emitted through the event bus with bounded output snippets. `cancelHarnessAgent(agentId)` is the explicit stop mechanism; elapsed time is not an implicit failure.
- **Harness cancellation API**. `POST /api/agents/cancel` explicitly requests `SIGTERM`, `SIGINT`, or `SIGKILL` for a running harness. A missing process is reported as `success: false`; never infer cancellation from elapsed time.
- **Shipped MCP execution paths**. Invocation manifests must resolve shipped MCP script arguments from the tool root because harnesses run with the project workspace as their working directory; OpenCode's native config must also preserve the injected orchestration environment.
- **Python MCP environment**. Run `./setup.sh` to create `.venv/dinah-orchestration` and install the shipped orchestration MCP requirements. Invocation prefers `DINAH_MCP_PYTHON`, then that venv, and finally the system Python fallback; do not install MCP packages into the system interpreter.
- **Projects are opt-in**. Startup and `GET /api/projects` must not seed or create `project-alpha`, `project-beta`, or any other project. Project folders/configuration are created only by an explicit project-creation flow or work dispatched to that project. Global CEO work uses the active working directory and must not create `projects/global/`.
- **Project manager invariant**. Every project-creation flow (`/handleStartProject`, `POST /api/projects/config`, the CEO `create_project` orchestration tool, and implicit project creation via harness dispatch in `resolveProjectDir`) must call the idempotent `ensureProjectManager` guarantee and send the project brief to that project's `manager-bard`; never create or list a project without a manager. After creating a project from the UI, reload agents (`loadAgents`) so the new manager appears immediately.
- **User-question handoff**. Agents that need a user decision use the orchestration `ask_user` tool. This sets status `awaiting-user`, persists the pending question, and emits `agent_needs_user`; a user reply clears the hold and resumes the agent. Keep the UI hold signal visible and do not route manager execution questions back through the CEO.
- **CEO startup model delegation**. When the frontend sends `"ceo"` for a top-level agent during first-run setup, the backend loads `prompts/ceo-select-top-level-models.md`, sends the selected CEO a candidate list and role requirements, validates the returned model IDs, and records the request/result in the CEO message log, thought log, and shared audit log. The prompt must remain provider-neutral and merit-based.
- **Model selectors**. First-run CEO and executive-council selectors reuse the grouped model presentation from Configure Agent Capabilities: models are grouped by harness and provider, with capability/context details shown on each option.
- **Harness prompt execution**. Pass agent prompts to harness CLIs as argument arrays (`execFileSync`), never by interpolating them into shell command strings; prompts can contain Markdown/code fences and shell metacharacters.
- **Harness CLI syntax is not interchangeable**. OpenCode uses `run ... --dir`; Codex uses `exec ... --cd` and requires the selected model via `--model`. Keep adapter-specific flags in their respective runner functions.
- **Startup selection observability**. The compact CEO request/result belongs in the CEO message/thought logs; the complete prompt, raw harness response, parsed decision, timing, and resolved assignments belong in `<working-area>/shared-state/startup-model-selection.json`.
- **Startup service workspace path**. `src/backend/services/startupService.js` must import `APP_DIR` from `config.js` when recording workspace-relative message/audit paths; `APP_DIR` is the active working directory alias.
- **Long-log UI behavior**. Message and thought renderers must collapse entries over 900 characters by default, show a short preview, and constrain expanded content with scrollable overflow and word wrapping.
- **Agent drawer payloads**. `/handleGetAgentStatus` returns `agent`, `messages`, `thoughts`, and `personalContext` as sibling fields. The frontend must merge those fields into drawer state; persisted messages use the backend `request` property.
- **Token tracking**. Each message sent via `POST /handleSendMessage` increments `context_used` by `round(message.length * 1.5) + 350` tokens and adds `spentUsd` to the project budget.
- **Environment variables**. `PORT`, `OLLAMA_HOST` (`default: http://localhost:11434`), `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY` are read at startup to detect harnesses.
- **Runtime configuration**. `.dinah` is a workspace marker and records non-secret runtime metadata such as the backend port. Agent prompts receive runtime context from backend code; they must not embed service URLs. Use MCP tools for narrowly scoped agent actions when available, while internal orchestration remains in backend services.
- **5-minute intervals**. Marshall sentinel and Senior Analyst both run on `setInterval(..., 300000)`. Do not manually run them more frequently than every 5 minutes without reason.

---

## 8. Common Agent Workflow

```bash
# 1. Start the server
node src/backend/server.js

# 2. Check available harnesses/models
curl http://localhost:2121/api/models

# 3. Request a new agent (awaiting-confirmation)
curl -X POST http://localhost:2121/api/agents/request-summon \
  -H "Content-Type: application/json" \
  -d '{"role": "backend-dev-cleric", "projectId": "project-alpha"}'

# 4. Confirm the agent (manifests as active)
curl -X POST http://localhost:2121/api/agents/confirm-summon \
  -H "Content-Type: application/json" \
  -d '{"agentId": "project-alpha-backend-dev-cleric"}'

# 5. Send a message to the agent
curl -X POST http://localhost:2121/api/handleSendMessage \
  -H "Content-Type: application/json" \
  -d '{"agentId": "project-alpha-backend-dev-cleric", "projectId": "project-alpha", "message": "Design the API for user authentication"}'
```
