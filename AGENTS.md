# DND — AGENTS.md

Compact instruction file for OpenCode sessions. Every line answers: "Would an agent likely miss this without help?"

---

# Important: Always update AGENTS.md when relevant after every change

## 1. Quickstart

| Action | Command |
|---|---|
| Start the backend server | `node backend.js` or `npm start` |
| Open the web UI | Browse to `http://localhost:2121` |
| Refresh harness/model discovery | `POST /api/models/refresh` or call `initializeHarnessesAndModels(true)` |

---

## 2. Project Structure

| Directory | Contents |
|---|---|
| `src/` | `backend.js` (Express server), `frontend.html`, `harnessRegistry.js` |
| `hr-system/` | `hr-system.json` (agent registry), `agent-<id>.msgs.json`, `agent-<id>.thoughts.json` |
| `projects/` | Isolated project workspaces (project-alpha, project-beta, project-gamma, project-delta) |
| `agent-templates/` | 23 markdown templates for agent archetypes |
| `shared-state/` | `shared-state.log` (append-only audit log) |

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
| `npm start` | Runs `node src/backend.js` |
| `npm run build` | `rm -rf dist && mkdir dist && cp src/backend.js dist/ && cp src/harnessRegistry.js dist/ && cp src/frontend.html dist/` |
| `npm test` | Exits with error ("no test specified") — no test suite configured |

No lint or typecheck configured. The repo uses `type: "module"` in `package.json`.

---

## 7. Key Conventions & Gotchas

- **Port**: Server defaults to `2121` (`PORT` env var supported).
- **CORS**: Enabled for all origins.
- **`APP_DIR`**: Server runs from `process.cwd()` — keep `backend.js` in `src/` and run from repo root.
- **HR registry is the source of truth**. `hr-system/hr-system.json` dictates active agents, their models, harnesses, context limits, and statuses. The UI reads from this file.
- **Project directories are auto-created**. `createProjectFolder(projectId)` in `backend.js` creates `projects/<id>/` with a `README.md` if missing.
- **Token tracking**. Each message sent via `POST /handleSendMessage` increments `context_used` by `round(message.length * 1.5) + 350` tokens and adds `spentUsd` to the project budget.
- **Environment variables**. `PORT`, `OLLAMA_HOST` (`default: http://localhost:11434`), `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY` are read at startup to detect harnesses.
- **5-minute intervals**. Marshall sentinel and Senior Analyst both run on `setInterval(..., 300000)`. Do not manually run them more frequently than every 5 minutes without reason.

---

## 8. Common Agent Workflow

```bash
# 1. Start the server
node backend.js

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