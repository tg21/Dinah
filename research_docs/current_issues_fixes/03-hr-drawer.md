# Plan 03 — HR drawer empty after provisioning agents

**Issue** (`current_issues.md` L4): *"HR did spawn agents, but there were no
chats/thoughts/messages in HR mind flayer's side drawer."*
**Phase**: 1 (with plan 02 — reuses its logging helper).

## RCA summary (verified in code)

`spawnAgentViaHr` (`src/backend/services/agentLifecycle.js:161-232`) writes the **new
agent's** message/thought files (`:220-228`) and never HR's; identical for
`confirmAgentSummoning` (`:140-148`, writes the confirmed agent's files) and
`ensureProjectManager` (`:235-242`, delegates to spawn). HR's harness turn is bypassed
entirely (direct DB write, no `spawnHarnessAgent`), so no `REASONING/EXECUTION`
thoughts accrue to HR either (`harnessRunner.js:322-327` never runs for HR). HR's drawer
only fills on direct `POST /handleSendMessage` to `hr-mind-flayer`.

## Fix design

Write **HR-perspective audit entries** (messages + thoughts) on each HR action, using
plan 02's shared helper:

- `requestAgentSummoning` receipt: requested role, model/harness/effort,
  specialization summary, requester.
- `spawnAgentViaHr`: provisioned agent ID, model, harness, effort.
- `confirmAgentSummoning`: confirmation + resulting active ID.
- `ensureProjectManager`: outcome (created vs already existed + ID).

Entries must include the key params (model/harness/effort/specialization) so the drawer
reads as a usable audit trail, not just "agent spawned".

**Explicit non-goal (phase 2+):** routing provisioning through a real HR harness turn
instead of a direct DB write. Valuable but a larger change; the audit entries fix the
reported symptom without it.

## Files to change

- `src/backend/services/agentLifecycle.js` only (+ plan 02's helper in
  `src/backend/services/messageService.js`).

## Tests (Vitest, deterministic)

- HR drawer contains a provision record after each path: direct spawn, confirm-summon,
  ensure-manager.
- Records carry model/harness/effort fields.

## Risks / non-goals

- No harness invocation for HR in this plan; HR still acts via direct service calls.
