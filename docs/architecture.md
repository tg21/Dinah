# Architecture — project layout and backend conventions

## Project structure

| Directory | Contents |
|---|---|
| `src/backend.js` | Deprecated shim — re-exports `src/backend/server.js` for backward compatibility |
| `src/backend/` | Modular Express server: `server.js` (listen/init), `app.js` (middleware + router mounting + React bundle static hosting with SPA fallback), `config.js` (tool-root/working-directory detection and paths), `routes/` (one `express.Router()` per domain: `projects`, `roles` (cosmetic sprite roster from templates), `models`, `mcps`, `agents`, `messages`, `knowledge`, `marshall`, `system`), `services/` (`hrService`, `projectService`, `messageService`, `eventBus`, `harnessRunner`, `agentLifecycle`, `startupService`, `knowledgeService`, `marshallService`), `mcp/` (`registry`, `catalog`, `permissions`, `invocation`), `harness/` (detection/discovery: `registry` orchestrator, `common` shared helpers, `store` in-memory state, `selector` role matching, `providers/` one module per harness: `opencode`, `antigravity`, `ollama`, `claude`, `gemini`, `codex`, `copilot`, `simulator`), `data/rpgRegistry.js` (agent RPG stats + thought pools) |
| `src/frontend/` | Vite + React 18 UI — see `systems/frontend.md` for the component map |
| `src/` (other) | `harnessRegistry.js` (deprecated shim — re-exports `src/backend/harness/index.js`) |
| `working-area/` | Default mutable user workspace created when launched from the tool repository; contains `hr-system/`, `projects/`, `shared-state/`, `user-mcps/`, and `.dinah` |
| `mcp/` | Shipped MCP registry and server packages tracked by git; never write UI-installed MCPs here |
| `agent-templates/` | JSON role definitions; each file is named for its role and contains `name`, `job`, and `basePrompt` (shipped/read-only) |
| `prompts/` | Shipped system prompts (read-only) |
| `docs/` | This documentation (indexed by `AGENTS.md`) |
| `research_docs/` | Investigation notes and plans (not normative; `docs/` wins on conflict) |

## Conventions

- **Route/service ownership**. Business logic lives in `src/backend/services/` and `src/backend/mcp/`; `src/backend/routes/*.js` files only validate input, call services, and format responses. Wire new endpoints as an `express.Router()` in `routes/` and mount it in `src/backend/app.js`.
- **Frontend hosting**. `src/backend/app.js` serves the Vite build from `dist/frontend/` (fallback `src/frontend/dist/`) with an SPA fallback for non-`/api` GETs. The React app in `src/frontend/` is the only UI — there is no raw-HTML fallback. After editing `src/frontend/`, run `npm run build:frontend` before testing the `:2121` UI, or use `npm run dev:frontend` (`:5173`, proxies `/api` + `/handle*` to `:2121`) for hot reload. New UI code goes in `src/frontend/src/` (API calls in `api/client.js`, shared state in `store/AppContext.jsx`).
- **Working directory detection**. `src/backend/config.js` derives the shipped tool root from the module location. When launched from the tool repository, mutable state is placed in `working-area/`; when launched from any other directory, that directory itself is the working area. A `.dinah` marker is created/read in the working area, and `/api/system/workspace` exposes the resolved paths.
- **Backend startup ordering**. `src/backend/server.js` listens on the configured port before harness/model discovery so the Vite proxy can connect while initialization is still running.
- **Runtime configuration**. `.dinah` is a workspace marker and records non-secret runtime metadata such as the backend port. Agent prompts receive runtime context from backend code; they must not embed service URLs. Use MCP tools for narrowly scoped agent actions when available, while internal orchestration remains in backend services.
- **Environment variables**. `PORT`, `OLLAMA_HOST` (`default: http://localhost:11434`), `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY` are read at startup to detect harnesses.
