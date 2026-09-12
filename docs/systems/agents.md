# System — agents (HR registry, lifecycle, staffing)

## HR registry is the source of truth

`<working-area>/hr-system/hr-system.json` dictates active agents, their models, harnesses, context limits, statuses, and cosmetic `appearance: { paletteId, variant }` (assigned at spawn/confirm, backfilled stably by id; recreated agents get a fresh look). The UI reads from this file. HR persistence lives in `src/backend/services/hrService.js`.

Explicit per-agent `model`/`harness` values are sticky: `loadHrSystem` only auto-picks when `model` is missing and only aligns `harness` when the model is discovered — an undiscovered-but-explicit model is never re-picked (detection skew must not flip providers). The frontend `defaultHarness` is only an ad-hoc send fallback, derived from the detected list (opencode preferred).

## Lifecycle rules

1. **HR Mind Flayer is the sole spawner**. Only the `hr-mind-flayer` agent (or API calls targeting HR) may create/modify agents.
2. **Summoning creates `awaiting-confirmation` state**. Use `POST /api/agents/request-summon` → agent appears in UI with "awaiting confirmation" badge → confirm via `POST /api/agents/confirm-summon`.
3. **Direct spawn creates `active` state**. Use `POST /api/agents/spawn` to immediately create an active agent.
4. **Agent statuses**: `active`, `working`, `paused`, `awaiting-confirmation`, `obsolete`. Setting `paused` skips both Marshall and Senior Analyst cycles for that agent.
5. **Post-spawn inbox seed**. `confirmAgentSummoning` and `spawnAgentViaHr` seed the new agent's durable inbox via `enqueueDirectMessage` — first `assigned` task (title + description + acceptance criteria, sender = task creator or HR fallback) or a check-in nudge when nothing is assigned. The existing 5s dispatcher is the waker; never call `spawnHarnessAgent` synchronously from the spawn path, and never seed before user approval.

## Staffing

- **Staffing authority**. Managers use `request_staff`; only `hr-mind-flayer` may use `provision_agent`. Both support model, harness, effort, and `promptOverride` specialization parameters, and the backend enforces the HR boundary. Staffing is template-only: `requestAgentSummoning`/`spawnAgentViaHr` reject unknown roles with `400` + the valid `agent-templates/` name list (never silently spawn degraded generic agents). Staffing-capable prompts carry the live roster (`Staffable roles ... ONLY these exact IDs` injected by `buildAgentPrompt`); do not hardcode the list into `manager-bard.json`. New pipeline roles must ship a template (including a `sprite: {hat,tool,ears}` block or the UI falls back to hood/staff/round) + RPG registry entry + thought pool + `ROLE_CONFIGS`/`SPAWNABLE_ROLES` entries (see `code-reviewer-justicar`, `tech-writer-scribe`).
- **Staffing visibility (generic, no per-pair helpers)**. All agent→agent exchanges go through the durable queue (`enqueueDirectMessage` in `messageQueueService.js`), which projects into BOTH drawers, emits `courier_message`, writes the shared log, and shows in message-activity. `requestAgentSummoning` sends requester→HR, HR confirm/spawn sends HR→agent the same way. Never add agent-pair-specific log helpers; fix visibility in the queue projection instead. Thread the caller `agentId` through `POST /api/internal/orchestration/staff` as `requesterId`.

## Prompts, models, questions

- **Agent definitions**. `src/backend/services/agentDefinitions.js` validates and loads `agent-templates/<role>.json`, then injects the role prompt and runtime workspace context into every harness invocation. Role definitions must not contain hardcoded API URLs or curl commands.
- **Model routing and specialization**. Each role definition contains `modelPolicy`, `runtimeCustomization`, and `coordination` metadata. HR/model selection uses the policy when choosing discovered models; staffing requests may provide a model override and a specialization prompt override, which is included in the invocation without replacing the core role prompt.
- **User-question handoff**. Agents that need a user decision use the orchestration `ask_user` tool (`question` + optional MCQ `options[]` + optional stable `questionId`; empty options = free text). Each call mints one open hold (same `questionId` re-asks dedupe); this sets status `awaiting-user`, persists the hold, and emits `agent_needs_user`. A user reply answers one hold (modal replies carry the id, plain text answers the oldest) and clears the hold only when none remain. Keep the UI hold signal visible and do not route manager execution questions back through the CEO.
- **User notices**. Agents that only need to inform (e.g. work finished) use `inform_user`: chat-only message + `agent_informs_user` event, no status change, never durable queue / Messages tab.
