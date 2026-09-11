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
5. **Visibility (plans 02+03, revised during implementation)**: NO per-pair helpers
   (no `logStaffingExchange`/`logHrAudit`). All agent→agent exchanges go through the
   durable queue (`enqueueDirectMessage`), which projects into BOTH drawers, emits
   `courier_message`, writes the shared log, and shows in message-activity.
   `ensureProjectManager` stays silent on no-op re-checks (no HR spam).

## Progress (2026-09-11 session — Phase 1 DONE)

- **02+03 staffing/HR visibility — DONE (generic path)**. `requestAgentSummoning`
  sends requester→HR, HR confirm/spawn sends HR→agent, both via
  `enqueueDirectMessage` (`agentLifecycle.js`). `createEnvelope`
  (`messageQueueService.js`) projects into both sender (`To X: …`) and recipient
  drawers with `deliveryId`/`messageId` dedup, emits `courier_message`, writes
  shared log. Claim/complete also project bounded snippets. Caller `agentId`
  threaded through `POST /api/internal/orchestration/staff` as `requesterId`;
  public `POST /api/agents/request-summon` accepts optional `requesterId`.
  Verified against `working-area/`: 4x `request_staff` at 21:05:35 + help
  `help-1789074621359` existed in log/coordination but HR drawer was `[]` —
  the exact bug fixed.
- **04+05 MCP defaults/role tools — DONE**. `seedDefaultPermissions(role)`
  + `ensureAgentMcpDefaults` + `resolveEffectiveMcps` in `mcp/permissions.js`
  (union `requiredTools`+`managerTools`+delivery protocol → orchestration entry;
  other-server tools via `mcp/registry.json`; unknown → warning). All creation
  paths seed instead of `{}`; `loadHrSystem` backfills legacy; explicit
  `enabled:false` wins; invocation force-inject kept as safety net.
  `GET /api/mcps?agentId=` returns effective set with `persisted|default`;
  both modals render source labels (`McpManagementModal.jsx`,
  `AgentEditModal.jsx`; `api.getMcps(agentId)`).
- **06 coordination IDs — DONE**. `slugifyProjectId` in `projectService.js`
  used by ID factory, CEO `create-project`, `createProjectFolder`/
  `getProjectFolder` (reads tolerate both). `canonicalAssignee` exported, warns
  on multi/no-match; task dispatch (`routes/orchestration.js`) resolves role
  names. New task/blocker/help/update records carry denormalized `projectId`.
- **Tests**: `npm test` 35/35. New `tests/backend/current-issues-phase1.test.js`
  (15 tests: both-drawer staffing, courier contract, HR provision/confirm
  records, queue dedup, persisted-vs-default, legacy backfill, per-role tools,
  slug, canonicalization, `projectId` denorm, old-format tolerance) +
  seeded-permission assertions in `tests/agents/role-contracts.test.js`.
- **AGENTS.md**: updated `/api/mcps?agentId=`, generic staffing-visibility rule
  (no per-pair helpers), MCP-defaults rule, slug/ID rule, queue-projection rule.

## Next (Phase 2, 07 DONE — 01 + 08 remain)

- **07 spawn wake — DONE 2026-09-11**. `seedPostSpawnInbox` in
  `agentLifecycle.js`: post-confirm/post-spawn inbox seed via
  `enqueueDirectMessage` (first `assigned` task incl. role-name fallback, else
  check-in nudge) → existing 5s dispatcher wakes. No sync `spawnHarnessAgent`,
  no pre-approval wake. `dispatch:true` canonical lookup was already landed
  (verified, no change needed). Tests: `npm test` 41/41 (new
  `tests/backend/current-issues-phase2-07.test.js`, 6 tests).
- **Spike (harness-native continuation) — DONE 2026-09-11**. `opencode run`
  has `-c/--continue` + `-s/--session` (+ `--fork`); `codex exec` has
  `resume`/`fork` subcommands; `agy` has `-c/--continue` + `--conversation`.
  Dinah runs all three one-shot today. Plan 01 must prefer native resume
  (plus session-ID tracking) over a custom loop; custom fallback stays
  event-based per user decision.
- **01**: DONE 2026-09-11 — resume-prompt enrichment + native-session
  continuation (spike above) + `awaiting-user` watchdog + durable reply +
  strict `agentId` + simulated badge. Coordination writes now wake via queue
  (progress→creator, blocker/help→manager, task→assignee); `runContinuation`
  drains follow-ups (max 5, stops on fresh `ask_user`); opencode `--format
  json` + per-agent `-s` resume verified live (nonce recall); Marshall
  re-broadcasts holds ≥10 min without clearing. Tests: `npm test` 53/53 (new
  `tests/backend/current-issues-phase2-01.test.js`, 12 tests).
- **Queue lease crash fix — DONE 2026-09-11**. Uncaught `acknowledge_message`
  throws (terminal stack + HTML 500) came from two causes: agents passing
  `deliveryId` where only `messageId` resolved, and late acks after long turns
  past the 2-min lease. Lease ops now resolve either id (recipient-scoped),
  refresh the lease on matching-token use, and still reject wrong tokens;
  claim/ack/complete/fail/release/message-status return JSON 404/409.
  Tests: +3 (`npm test` 58/58).
- **Dispatcher claim-settling fix — DONE 2026-09-11**. Live `working-area`
  showed the boot digest stuck `claimed` (attempts climbing, no work): the
  manager's `antigravity` harness was quota-failing into simulator fallback,
  which never settled the claim, so lease expiry re-queued it forever.
  `dispatchAgent` now completes every claim post-turn, or fails retryable on
  simulator-fallback-of-broken-harness (dead-letters after 3, with
  thought+shared-log audibility).   Tests: +2 (`npm test` 68/68).
- **Sticky model/harness fix — DONE 2026-09-11**. Live `working-area`
  showed the manager flipped to `antigravity` despite opencode config:
  `loadHrSystem` re-picked model+harness whenever the explicit model id was
  momentarily undiscovered (detection skew), and manager hints (`pro`)
  match agy models. Reconciliation now only fills missing models and aligns
  harness for discovered ones — explicit pairs are never re-picked. UI
  `defaultHarness` no longer hardcoded to agy (detected list, opencode
  preferred; ad-hoc fallback only, never overrides per-agent dispatch).
  Tests: `npm test` 71/71 (new `tests/backend/hr-model-sticky.test.js`).
- **Harness sessions follow-up — Codex DONE 2026-09-11**. `codex exec --json`
  + `exec resume <thread-id>` wired in `spawnCodexAgent` (thread persisted on
  HR record, stale-thread retry, `--skip-git-repo-check` always since project
  dirs lack `.git`; `resume` reuses thread cwd, no `--cd`). Nonce recall
  verified live twice (both arg orders). `agy` stays one-shot (live probe hit
  subscription quota, conversation-ID format unverified); claude/gemini/ollama
  binaries absent on host. Tests: +2 parser cases (`npm test` 55/55).
- **08**: per-project KB schema + `get/update_project_knowledge` tools +
  synthesizer cycle + drop fantasy seed + modal check.
- **Boot reconciliation + stale-read race guard — DONE 2026-09-11**.
  `runBootReconciliation` (`services/bootReconciliation.js`, wired in
  `server.js` startup): one `boot-reconciliation` digest per manager of a dirty
  project + HR for pending confirmations/HR tasks; workers never swept, clean
  projects / paused recipients / stacked digests skipped. `recordTask` is
  idempotent via explicit `idempotencyKey` (`create_task` passthrough) +
  content-fingerprint (`sha1` title+description+criteria) within
  `coordination.taskDedupeWindowMs` from workspace `.dinah` (default 15 min,
  `getTaskDedupeWindowMs`, never hardcoded); same-title scope growth still
  creates + logs overlap; `requestHelp` dedupes the same way. Fresh-read +
  key-passing rules added to dispatcher/resume prompts (templates untouched).
  Tests: `npm test` 67/67 (new `tests/backend/boot-reconciliation.test.js`,
  9 tests).
- **Boot digest supersede fix — DONE 2026-09-11**. Live restart proved the
  double-restart guard wrong: the old digest kept re-queuing via lease expiry
  (failing agy turns), and the sweep skipped the fresh send because "a queued
  digest exists" — log showed `notified [none]` with open work pending.
  Stale queued digests are now retired (completed as superseded) so the fresh
  snapshot always wins; only an in-flight (claimed) digest skips the
  recipient.   Tests: +1 (`npm test` 72/72).
- **Sweep misdelivery fix — DONE 2026-09-11**. Live `working-area` showed
  digests for legacy project `hello world` (open tasks owned by
  `hello world-manager-bard`, opencode) routed to the slug twin
  `hello-world-manager-bard` (owning nothing, agy-broken → dead-letter):
  the sweep resolved via slug-guarantee `ensureProjectManager`. It now
  prefers the manager on the exact project string, slug guarantee only as
  fallback. Tests: +2 (`npm test` 74/74).

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
