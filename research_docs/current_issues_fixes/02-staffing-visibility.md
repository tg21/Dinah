# Plan 02 — Manager↔HR staffing communication visible in frontend

**Issue** (`current_issues.md` L3): *"Manager's communication with HR for creating new
specialized agents was not visible in the frontend (not present in HRs messages in side
drawer)."*
**Phase**: 1 (with plan 03 — shares the logging helper).

## RCA summary (verified in code)

`request_staff` flows `mcp/servers/dinah-orchestration/server.py:44-46` →
`POST /api/internal/orchestration/staff` → `requestAgentSummoning`
(`src/backend/services/agentLifecycle.js:40-112`). Its only side effects are
`appendToSharedLog` (`:101-103`, → `shared-state.log`, not any drawer file) and a
`summon_requested` broadcast (`:104-109`) — which the frontend ignores
(`AppContext.jsx:75` only handles `courier_message`; `/api/message-activity` reads the
durable queue only). Zero calls to `appendAgentMessage` for either party, while the
drawer renders `agent-<id>.msgs.json` (`messageService.js:9-29` via
`POST /handleGetAgentStatus`). Same structural gap for `send_agent_message`
(`coordinationService.js:125-128` → durable queue only, no projection). Also note the
`staff` handler never receives the caller `agentId` for logging
(`routes/orchestration.js:46-55`).

## Fix design

1. **Shared helper** (new, in `src/backend/services/messageService.js`), e.g.
   `logStaffingExchange(requesterId, 'hr-mind-flayer', text)`:
   - `appendAgentMessage` to **both** parties' `msgs.json` + one thought each,
   - existing shared-log line,
   - `courier_message` event with the full courier contract
     (`messageId`, `deliveryId`, `projectId`, sender, recipient, summary) so the play
     area and Messages tab pick it up.
2. **Call it from `requestAgentSummoning`**; thread the caller `agentId` through
   `routes/orchestration.js` (currently dropped).
3. **Queue→projection (general fix).** On claim/complete, project durable-queue
   deliveries into the recipient's `agent-*.msgs.json` (bounded snippet). This matches
   the documented architecture ("`msgs.json` is a UI/audit projection") and fixes
   visibility for all agent DMs, not just staffing. Guard against duplicates
   (delivery-ID marker).

## Files to change

- `src/backend/services/messageService.js` — new helper.
- `src/backend/services/agentLifecycle.js` — call helper in `requestAgentSummoning`.
- `src/backend/routes/orchestration.js` — pass caller `agentId` through.
- `src/backend/services/messageQueueService.js` — projection hook on claim/complete.
- Frontend: expected no change; verify `message-activity` shows the new events.

## Tests (Vitest, deterministic)

- Staffing request appears in both requester and HR drawer files.
- `courier_message` emitted with required payload fields.
- Queue projection appears once (no duplicates on re-claim).
- Golden fixture if a real invisible-exchange trace is captured.

## Risks / non-goals

- Projection must stay snippet-bounded; full bodies live in the queue.
- No change to staffing auth boundary.
