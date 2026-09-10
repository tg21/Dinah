# Fix-plan index — `current_issues.md` (9 issues)

Source of truth: `research_docs/current_issues.md` (9 numbered lines; line 1 is a log
pointer, lines 2–9 are the 8 issues). RCA was performed against the code at commit
`c59f457` via read-only investigation plus direct verification of
`src/backend/routes/messages.js` and `src/backend/services/coordinationService.js`.

## File map

| Plan file | Issue (`current_issues.md` line) | Summary |
|---|---|---|
| `01-manager-autonomy.md` | L2 — manager stalls after user reply | Resume-prompt enrichment + bounded continuation loop + `awaiting-user` watchdog |
| `02-staffing-visibility.md` | L3 — manager↔HR staffing invisible | Log staffing exchange to both drawers + `courier_message` event + queue→`msgs.json` projection |
| `03-hr-drawer.md` | L4 — HR drawer empty after provisioning | HR-perspective audit entries on request/provision/confirm |
| `04-mcp-defaults.md` | L5 — MCP checkboxes empty | Seed persisted `agent.mcp` at creation + effective-set endpoint + unify modals |
| `05-role-tools.md` | L6 — activate `requiredTools`/`managerTools` | `seedDefaultPermissions(role)` helper; tool→server mapping via `mcp/registry.json` |
| `06-coordination-ids.md` | L7 — `"hello world-manager-bard"` concatenation | Shared slug helper + stronger `canonicalAssignee` + denormalized `projectId`; write-path only |
| `07-spawn-wake.md` | L8 — spawned specialists never start | Post-confirm/spawn inbox seed → dispatcher wake; canonical dispatch lookup |
| `08-knowledge-base.md` | L9–10 — junk in `knowledge-base.json` | Confluence-style per-project team docs; synthesizer cycle; drop hardcoded seed |

## Agreed decisions (locked before implementation)

1. **Scope**: phased, visibility first. Phase 1 = plans 02–06; Phase 2 = plans 07 + 01,
   then 08. Plans 02+03 share one logging helper — implement together. Plans 04+05 share
   the creation-path seeding — implement together. Plan 07's wake feeds plan 01's loop —
   implement together.
2. **IDs (plan 06)**: write-path fix only, no migration. Current `working-area/` data is
   test data and will be deleted before the next test. Readers stay tolerant of both
   formats indefinitely.
3. **Autonomy (plan 01)**: bounded continuation loop; check harness-native multi-turn
   modes first (no re-invented wheel). A "wake me later" MCP was considered and rejected
   as unreliable — a server-side `wakeAt` + dispatcher check is the approved alternative
   if deferred wake is ever needed.
4. **Knowledge base (plan 08)**: Confluence model — team-maintained project docs
   (overview, architecture, decisions, glossary, runbooks), NOT task/updates/blockers
   telemetry.

## Shared implementation rules (from `AGENTS.md`, apply to every plan)

- Business logic in `src/backend/services/` (and `src/backend/mcp/`); `routes/` only
  validate, call services, format responses. New endpoints = `express.Router()` mounted
  in `src/backend/app.js`.
- Harness dispatch stays async/event-completion based. No fixed wall-clock timeouts on
  harness turns. Prompts passed as argv arrays, never shell-interpolated.
- Tests are deterministic Vitest: no harness CLIs, API keys, network, or mutable runtime
  state unless explicitly opt-in integration.
- Every real failure found → smallest useful redacted JSON fixture under
  `tests/evals/fixtures/` + reproducing assertion BEFORE the fix. Golden set is append-only.
- `agent-*.msgs.json` remains a UI/audit projection; `shared-state/message-queue.json`
  remains the durable source of truth.
- HR Mind Flayer stays the sole spawner; staffing boundary (`request_staff` vs
  `provision_agent`) is enforced, not bypassed.
- Update `AGENTS.md` when a plan changes a convention.
