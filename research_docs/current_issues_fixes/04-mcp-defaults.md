# Plan 04 — MCP defaults: checkboxes empty, effective vs persisted split

**Issue** (`current_issues.md` L5): *"HR didn't have default mcps activated by default
on frontend (the checkboxes were empty in mcp manager dialog for HR)."*
**Phase**: 1 (with plan 05 — shares creation-path seeding).

## RCA summary (verified in code)

- Creation persists `mcp:{}` (`services/hrService.js:26`, `agentLifecycle.js:95,214`);
  `resolveAgentMcps` (`mcp/permissions.js:8-16`) filters the registry by
  `permissions[mcp.id]?.enabled===true` → `[]`.
- The backend hides this by force-injecting `dinah-orchestration` **ephemerally** at
  invocation (`mcp/invocation.js:37-44,105-111`) without persisting to `hr-system.json`.
- The frontend reads persisted-only: `McpManagementModal.jsx:57,122-123,136-142`
  (`agent.mcp?.[mcp.id]?.enabled===true` → Equip/Unequip), same in
  `AgentEditModal.jsx:16,114,124`. `GET /api/mcps` (`routes/mcps.js:7-9`) returns the
  registry, not any agent's effective set. `AgentEditModal.jsx:108-110` has a display-only
  fallback pretending orchestration is enabled; `McpManagementModal.jsx` has none —
  hence "checkboxes empty".

## Fix design

1. **Seed at creation.** New agents persist
   `mcp: { 'dinah-orchestration': { enabled: true } }` (+ plan 05's tool-derived
   entries) instead of `{}`. Backfill on load for legacy records.
2. **Effective-set endpoint.** `GET /api/mcps?agentId=` (or extend the agent payload)
   returning the agent's **effective** MCP set with a `source: persisted | default`
   label per entry, so the UI can distinguish explicit equips from defaults.
3. **Unify the modals.** Both `McpManagementModal` and `AgentEditModal` render the
   effective set with source labels. Keep the backend force-inject as a safety net —
   the invariant "orchestration is always enabled at invocation" must never break.

## Files to change

- `src/backend/services/hrService.js`, `src/backend/services/agentLifecycle.js` —
  seed + backfill.
- `src/backend/mcp/permissions.js` — effective-set resolver.
- `src/backend/routes/mcps.js` — effective-set endpoint.
- `src/frontend/src/components/Modals/McpManagementModal.jsx`,
  `src/frontend/src/components/Modals/AgentEditModal.jsx` — render effective set.

## Tests (Vitest, deterministic)

- New agent has orchestration enabled (persisted, not just ephemeral).
- Effective-set endpoint labels persisted vs default correctly.
- Legacy `{}` record backfills on load.

## Risks / non-goals

- Unequipping a default in the UI must persist an explicit `enabled:false` that wins
  over the default (but never for the mandatory orchestration injection at invocation).
