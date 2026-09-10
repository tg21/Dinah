# Plan 05 — Activate `requiredTools` / `managerTools` from role JSON

**Issue** (`current_issues.md` L6): *"For HR or any other agent, we should activate
their 'required_tools' or any other tools 'manager_tools' for manager mentioned in
their json files."*
**Phase**: 1 (with plan 04 — shares creation-path seeding).

## RCA summary (verified in code)

Role templates **do** declare tool requirements — in camelCase
`coordination.requiredTools` / `coordination.managerTools` (e.g.
`agent-templates/hr-mind-flayer.json`, `manager-bard.json:24-38`; repo has **zero**
snake_case `required_tools` hits, so docs/UI copy must use the real camelCase names).
But the only consumer is `mcp/invocation.js:9-20`, which unions them into the
**ephemeral** orchestration `allowedTools` at invocation. Nothing seeds `agent.mcp`,
enables other MCP servers, or sets per-server tools (`permissions.js:18-35`
`sanitizeMcpPermissions` and `agentDefinitions.js:12-49` never consult `coordination`;
no creation path copies template tools). Proof: the integration test manually unions
these fields (`tests/evals/manager-trajectory.integration.test.js:96-100`) because
production code doesn't.

## Fix design

New helper `seedDefaultPermissions(role)` in `src/backend/mcp/permissions.js`:

- Union `coordination.requiredTools + coordination.managerTools` →
  orchestration entry `allowedTools`.
- For tools owned by **other** MCP servers, enable those servers for the agent, using
  `mcp/registry.json` (`:12-30`) as the tool→server map. Tools with no owning server →
  shared-log warning, not a crash.
- Called from every creation path: direct spawn, confirm-summon, `ensureProjectManager`,
  `hrService` init (covers plan 04's seeding in one place).

Extend `tests/agents/role-contracts.test.js` (currently asserts template presence only)
to assert **seeded permissions**: manager gets `request_staff`, HR gets
`provision_agent`, workers get progress/blocker/help/message tools.

## Files to change

- `src/backend/mcp/permissions.js` — new `seedDefaultPermissions(role)`.
- `src/backend/services/agentLifecycle.js`, `src/backend/services/hrService.js` — call it.
- `mcp/registry.json` — read-only mapping source (no format change).
- `tests/agents/role-contracts.test.js` — assert seeded output.

## Tests (Vitest, deterministic)

- Per-role seeding: manager/HR/worker tool sets land in `agent.mcp`.
- Unknown-tool warning path (no crash, logged).
- Role-contract regression test.

## Risks / non-goals

- If two servers claim the same tool name, prefer the shipped `dinah-orchestration`
  mapping and log the ambiguity.
- No per-tool (narrower than server) enforcement in this plan.
