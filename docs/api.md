# API — endpoint reference

Most frequently needed endpoints. See `systems/agents.md`, `systems/messaging.md`, and `processes/operations.md` for the flows behind them.

| Endpoint | Method | Description |
|---|---|---|
| `/api/agents` | GET | View active agent roster (loads `hr-system.json`) |
| `/api/models` | GET | View available AI harnesses and models |
| `/api/harnesses` | GET | View detected harnesses only |
| `/api/roles` | GET | View cosmetic sprite roster (`sprite` blocks from templates) |
| `/api/agents/request-summon` | POST | Place agent in `awaiting-confirmation` state. Body: `{ role, projectId?, name?, model?, harness?, effortLevel?, promptOverride?, requesterId? }` |
| `/api/agents/confirm-summon` | POST | Manifest agent from `awaiting-confirmation` to `active`. Body: `{ agentId, updatedParams? }` |
| `/api/agents/spawn` | POST | Spawn agent directly as `active` (bypasses confirmation). Body: `{ role, projectId?, customName?, model?, harness?, effortLevel?, promptOverride? }` |
| `/api/agents/update` | POST | Update agent name, model, harness, effortLevel, prompt, stats. Body: `{ agentId, updates }` |
| `/api/agents/set-status` | POST | Set agent status (`active`/`working`/`paused`/`retired`). Body: `{ agentId, status }` |
| `/api/agents/cancel` | POST | Explicitly stop a running harness (`SIGTERM`/`SIGINT`/`SIGKILL`). Missing process → `success: false`; never infer cancellation from elapsed time. Body: `{ agentId, signal? }` |
| `/api/mcps?agentId=<id>` | GET | View an agent's effective MCP set with `source: persisted \| default` per entry (persisted-only registry when omitted) |
| `/api/marshall/run` | POST | Run Marshall Sentinel manual audit (context exhaustion, stuck processes, obsolete cleanup) |
| `/api/marshall/audit` | GET | View last Marshall audit report |
| `/api/knowledge-base` | GET | View company knowledge base |
| `/api/knowledge-base/run-analyst` | POST | Run Senior Analyst Diviner inspection (5-min synth cycle) |
| `/api/message-activity` | GET | Drawer message feed (see `systems/messaging.md`) |
| `/api/events` | GET | One-shot agent event catch-up (courier animation, roster changes) |
| `/api/events/stream` | GET (SSE) | Live roster/event push — subscribe, never poll (see `systems/messaging.md`) |
| `/api/projects` | GET | List all projects and their configs |
| `/handleGetAgentStatus` | POST | Drawer payload: `agent`, `messages`, `thoughts`, `personalContext` siblings |
| `/handleSendMessage` | POST | Send a user message to an agent (see `systems/messaging.md`) |
