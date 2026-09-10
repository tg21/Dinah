# Plan 07 — Spawned specialists start working after approval

**Issue** (`current_issues.md` L8): *"Spawned specialized agents didn't start working on
their tasks after being spawned (they were approved to spawn by user)."*
**Phase**: 2 (with plan 01 — this wake feeds the autonomy loop).

## RCA summary (verified in code)

Symptom evidence: all four `hello world-*` specialists sit `active` with
`context_used:1000` (init value), tasks stay `assigned`, and `message-queue.json` has
nothing for them. The post-spawn path has no wake: `confirm-summon`
(`routes/agents.js:31-41` → `confirmAgentSummoning`, `agentLifecycle.js:114-159`) and
direct spawn (`:161-232`) set `active`, write a greeting message, broadcast — then stop.
No `spawnHarnessAgent`, no inbox seed, no task lookup. The only wakes are user messages
(`routes/messages.js:117`) and the 5s dispatcher, which requires a queued inbox item
(`messageDispatcher.js:13-15`). Additionally, `create_task` defaults `dispatch=False`
(`mcp/servers/dinah-orchestration/server.py:56,58`) and its exact-ID lookup
(`routes/orchestration.js:75-76`) 404s on role names — so even an eager manager can't
auto-start workers.

## Fix design

1. **Post-confirm / post-spawn wake** (in `agentLifecycle.js`, both paths): resolve
   tasks assigned to the new agent ID (canonical matching), seed its inbox with the
   first task via `enqueueDirectMessage` (title + description + acceptance criteria),
   and let the existing 5s dispatcher wake it within seconds (preferred — no new sync
   coupling). Direct `spawnHarnessAgent` as fallback where the caller already awaits.
2. **Fix the `create_task` dispatch path** (`coordinationService.js`): route assignee
   lookup through `canonicalAssignee` so `dispatch:true` works with role names instead
   of 404ing.
3. **Decision:** keep the MCP `dispatch=False` default; the inbox seed is the reliable
   starter. The user-approval gate is untouched — auto-start happens only *after*
   approval.

## Files to change

- `src/backend/services/agentLifecycle.js` — wake after confirm + spawn.
- `src/backend/routes/agents.js` — thread through if needed.
- `src/backend/services/coordinationService.js` — canonical dispatch lookup.
- `src/backend/services/messageDispatcher.js` — verify; no change expected.

## Tests (Vitest, deterministic, isolated state)

- Confirm → inbox seeded → dispatcher wakes agent (mock harness).
- Dispatch-by-role-name resolves instead of 404.
- No wake before approval (gate preserved).

## Risks / non-goals

- If no task is assigned to the new agent, seed a "check in with your manager" nudge
  rather than a harness turn with empty context (avoids wasted spend).
