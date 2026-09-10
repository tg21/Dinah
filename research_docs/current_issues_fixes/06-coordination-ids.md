# Plan 06 — Coordination IDs: pure agent IDs + separate project field

**Issue** (`current_issues.md` L7): *"in coordination.json in shared-state folder,
assignee and agentId properties should be just agent Ids and there should be a separate
property for project rather than doing concatenation like
`"assignee": "hello world-manager-bard"`."*
**Phase**: 1. **Write-path fix only — no migration** (locked decision: current
`working-area/` data is test data, deleted before the next test).

## RCA summary (verified in code)

1. The ID factory concatenates raw IDs: `` `${projectId}-${role}` ``
   (`services/agentLifecycle.js:42,163`) with no slug/sanitize — spaces included.
   Only the CEO path sanitizes (`routes/orchestration.js:35`,
   `toLowerCase().replace(/[^a-z0-9-]+/g,'-')`). `projectService.js:22-34` also uses
   raw `projectId` as dirname/config key (hence the `"hello world"` folder with a space).
2. `canonicalAssignee` (`services/coordinationService.js:34-46`) resolves role→HR agent
   ID only on a **unique** active/working match; with 0 or 2+ matches it stores the raw
   input verbatim — hence both `"hello world-manager-bard"` AND bare `"backend-dev-cleric"`
   entries in `coordination.json`.
3. Tasks carry no `projectId` field (`recordTask`, `:48-62` builds
   `{id,title,description,assignee,...,createdBy}`); the project is only implicit in the
   `projects[projectId]` wrapper. Same for blockers (`:91-98`), help requests
   (`:101-108`), and progress updates (`:86`, raw `agentId`).

## Fix design

1. **Shared slug helper**, e.g. `slugifyProjectId` in `services/projectService.js`,
   imported by the CEO path, the `agentLifecycle` ID factory, and `projectService`
   dirnames — one rule everywhere: lowercase, `[^a-z0-9-]+` → `-`.
2. **Stronger `canonicalAssignee`** (`coordinationService.js`): unique match → HR agent
   ID; multi/no-match → keep input + warn to shared log. **Readers stay tolerant of both
   formats indefinitely** (`updateTaskProgress` dual matching at `:73-81` is the pattern
   to keep).
3. **Denormalized `projectId`** on all newly written task / blocker / help-request /
   progress-update records (wrapper stays as-is).

## Files to change

- `src/backend/services/projectService.js` — new shared slug helper.
- `src/backend/services/agentLifecycle.js` — use it in the ID factory (`:42,163`).
- `src/backend/routes/orchestration.js` — use it in the CEO path (`:35`).
- `src/backend/services/coordinationService.js` — canonicalization + `projectId` fields.

## Tests (Vitest, deterministic)

- Slug-on-create (`"hello world"` + role → spaceless ID; dirname matches).
- Role→ID canonicalization: unique resolves, multi/none keep input + warn.
- New tasks/blockers/updates carry `projectId`.
- Old-format records still readable (both formats).

## Risks / non-goals

- No migration of existing files (per locked decision).
- Slugs could theoretically collide for near-identical project names — the unique-match
  rule plus warn-logging surfaces this instead of hiding it.
