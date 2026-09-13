# Quickstart — run, build, and common workflows

## Run

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

Server defaults to port `2121` (`PORT` env var supported). CORS is enabled for
all origins. `src/backend/server.js` listens before harness/model discovery so
the Vite proxy can connect while initialization is still running.

## Build & scripts

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
| `npm run eval -- --harness <name> --model <id>` | Runs live trajectory/outcome evals (see `testing.md`) |
| `npm run test:all -- --harness <name> --model <id>` | Runs normal tests, then live evals |

No lint or typecheck configured. Root uses `type: "module"`; `src/frontend/` is a separate Vite package (`dnd-frontend`) with its own `package.json`.

## Common agent workflow

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
