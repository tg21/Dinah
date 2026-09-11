# 09 — Duplicate specialists → `update_task_progress` 500s (record-only)

Date: 2026-09-11. Status: **documented, no code change** (user decision).

## Symptom (live terminal)

Multiple copies of the same specialized agent existed (stale-roster
double-provision, pre-SSE fix). Terminal showed repeated:

```
Error: Task not found or agent is not its assignee
    at updateTaskProgress (src/backend/services/coordinationService.js:199:20)
    at src/backend/routes/orchestration.js:104:91
    ... Express Layer/Route frames ...
```

## Mechanism (verified by read)

1. **Ownership check** (`coordinationService.js:187-199`): a progress write
   matches only when `task.id === taskId && (createdBy === agentId ||
   assignee === agentId || assignee === agent.role)`. Anything else throws.
2. **Concrete-ID tasks reject siblings**: a task pinned to copy A's concrete
   ID (`assignee = "<proj>-<role>"`) is rejected when sibling copy B (same
   role+project, different ID) reports on the same `taskId` — B is not the
   creator, not the assignee ID, and `assignee (A-ID) !== B.role`. Miss →
   throw. Tasks stored verbatim as a bare role (multi-match path below) still
   pass via the role clause, so the failure is specifically
   concrete-ID + sibling reporter.
3. **Duplicates force the ambiguous path**: `canonicalAssignee`
   (`coordinationService.js:96-116`) resolves role→ID only on a unique
   active/working match; with 2 live copies it stores the bare role verbatim
   + shared-log warning (see `tests/backend/current-issues-phase1.test.js:298-304`).
4. **Noisy 500, not JSON**: `POST /api/internal/orchestration/progress`
   (`routes/orchestration.js:104`) calls `updateTaskProgress` unwrapped, so a
   miss becomes an Express 500 + stack. Queue lease routes (`:116-132`) already
   map to JSON `404/409` — this route was never converted.
5. **Likely trigger**: both live copies wake from the same broadcast/queue
   work and report on the same `taskId`; the second (sibling) write throws.

## Evidence to capture next time

- `shared-state/coordination.json`: task `id`, `assignee` (concrete ID vs
  bare role), `createdBy`, `projectId`.
- `hr-system/hr-system.json`: the two IDs sharing one role+project, their
  `status` values, and which `agentId` reported the failing progress call.

## Deferred decisions (locked)

- **No ownership-semantics change now.** Role-sibling acceptance (any live
  same-role+project agent may post progress without stealing assignment)
  stays undecided.
- **No duplicate-cleanup helper now.** Extras are retired manually via the UI
  once roster live-sync (SSE `GET /api/events/stream`) makes them visible.
- **Future fix sketch (not implemented):** wrap the progress route like
  `queueRoute` — `404` unknown task, `409` not-assignee with
  `taskId`+`agentId` context, no stack — mirroring the queue-lease crash fix
  (`00-index.md` queue lease entry).

## Cross-refs

- Plan 06 (`canonicalAssignee` multi-match verbatim rule, `AGENTS.md`
  task-assignee row); plan 07 dispatch lookup; SSE roster sync
  (`GET /api/events/stream`: `summon_requested`/`agent_spawned`/
  `summon_confirmed`/`agent_updated`/`agent_status_changed`).
