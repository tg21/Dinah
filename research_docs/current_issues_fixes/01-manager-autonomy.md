# Plan 01 — Manager autonomy: keep working after user reply

**Issue** (`current_issues.md` L2): *"Manager doesn't keep working autonomously.
Doesn't always start working by himself after user response."*
**Phase**: 2 (with plan 07 — the spawn wake feeds this loop).

## RCA summary (verified in code)

1. **Resume prompt loses context.** `POST /handleSendMessage`
   (`src/backend/routes/messages.js:94-96`) nulls `pendingUserQuestion` *before*
   dispatch and never injects it into the prompt. The model resumes on the raw reply
   (e.g. `"proper engineering"`) with no original question, no brief, no task context
   (`harnessRunner.js:342-350` + `agentDefinitions.js:30-49` build the prompt from role
   `basePrompt` + runtime context + raw message only).
2. **One-shot execution, no continuation.** After the single resumed
   `spawnHarnessAgent` turn exits, nothing re-wakes the manager: the 5s dispatcher
   (`messageDispatcher.js:12`) explicitly skips `awaiting-user` (and only wakes on queued
   inbox), Marshall (`marshallService.js:76-82`) only resets idle `working → active` and
   never touches `awaiting-user`. If the turn didn't finish staffing + dispatch, the
   manager looks stalled while `working`.
3. **Reply invisible to agent tooling.** The reply is written only to
   `agent-*.msgs.json` (`messages.js:72-78`), never the durable queue — the manager's
   `list_inbox` can never see the user's answer.
4. **Aggravators**: silent `agentId='ceo-warlock', projectId='project-alpha'` defaults
   (`messages.js:65`) misroute replies so the real manager waits forever; simulator
   fallback output (`harnessRunner.js:293-337`) is indistinguishable from a stall in the UI.

## Fix design

1. **Resume-prompt enrichment** (`routes/messages.js`, `services/agentLifecycle.js`).
   Capture `pendingUserQuestion` before clearing; build the resume prompt as:
   original question + project brief + coordination snapshot (open tasks/blockers) +
   drained inbox batch + user reply.
2. **Bounded continuation loop — harness-native first.** Spike before building:
   check `opencode run --help`, codex/gemini resume/loop flags for a native multi-turn
   mode and prefer it over custom code. If absent, implement a server-side loop: after
   each turn, re-dispatch while (queued inbox for the agent OR undispatched assigned
   tasks exist) AND turns < N (e.g. 5); stop early on fresh `ask_user`. No fixed
   wall-clock timeouts (per harness-async convention).
3. **`awaiting-user` watchdog.** Marshall or dispatcher re-broadcasts `agent_needs_user`
   if a hold exceeds X minutes. Hold stays visible; never auto-cleared.
4. **Durable reply.** Also enqueue the user reply into `message-queue.json` (or otherwise
   surface it to `list_inbox`).
5. **Routing + honesty.** Return 400 for unknown `agentId` instead of silently
   defaulting; render `simulated:true` results distinctly in the UI.
6. **Deferred-wake note (decision locked).** A "wake me in N min" MCP was considered and
   **rejected** as unreliable (harness process exits; nothing honors the alarm). If a
   deferred wake is ever needed, use a server-side `wakeAt` field on the HR record +
   dispatcher check instead. No new MCP for this.

## Files to change

- `src/backend/routes/messages.js` — resume enrichment, durable reply, strict `agentId`.
- `src/backend/services/agentLifecycle.js` — brief/snapshot helpers for the prompt.
- `src/backend/services/marshallService.js` or `messageDispatcher.js` — watchdog.
- Continuation loop — new service (custom) or harness-native flag wiring in
  `src/backend/services/harnessRunner.js`.
- `src/frontend/` — simulated-result badge (small).

## Tests (Vitest, deterministic)

- Resume prompt contains the original question + brief + tasks.
- Loop quiescence: mocked harness turns stop when no work remains; stop on `ask_user`.
- Watchdog re-broadcasts after timeout; hold preserved.
- Unknown `agentId` → 400.
- Golden fixture under `tests/evals/fixtures/` if a real stall trace is captured.

## Risks / non-goals

- Loop cost: cap turns (N) and require quiescence proof each iteration to avoid runaway spend.
- No change to the `ask_user` user-approval gate itself.
