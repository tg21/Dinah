# Plan 08 — Knowledge base as team-maintained project docs

**Issue** (`current_issues.md` L9–10): *"what the hell is going on with the
knowledge-base.json, why is there random crap in there rather than projects' knowledge
base."*
**Phase**: 2 (independent — can run parallel to 07+01).

## RCA summary (verified in code)

1. **Hardcoded junk seed.** `loadKnowledgeBase` (`src/backend/services/knowledgeService.js:7-67`)
   writes 4 fantasy topics (Microservice Event Bus, SOLID Oath, ACID, Marshall 90%) when
   the file is missing; they persist forever.
2. **Telemetry-only cycle.** `runSeniorAnalystInspection` (`:75-125`) never calls a
   harness, never reads `coordination.json` or file contents — only `readdirSync` + HR
   names — then bumps `lastUpdated` with a file-count blurb (`fileCount:1 README.md`
   for a project with a real plan in coordination).
3. **No analyst prompt exists.** `prompts/` contains only `ceo-select-top-level-models.md`;
   "senior-analyst" appears only in scheduler wiring, the role template, and a simulator
   flavor string. So: missing prompt + missing synthesis + missing project scoping.

## Fix design (Confluence model — locked decision)

The KB is **team-maintained project documentation**, not task telemetry:

1. **New per-project schema**: `overview, architecture, decisions, glossary, runbooks`
   under each project key. No task/update/blocker lists (those live in coordination).
2. **New orchestration tools** (in `mcp/servers/dinah-orchestration/server.py` + backend
   handlers): `get_project_knowledge`, `update_project_knowledge` — so agents maintain
   the docs as work happens.
3. **Rewrite the 5-min cycle into a synthesizer**: bounded reads of project files +
   existing KB + recent coordination summaries → update KB sections. LLM via harness
   where available; clearly-labeled deterministic digest fallback otherwise. Never seed
   fantasy content; new files start as empty per-project sections.
4. **Drop the hardcoded seed** for new files (write-path only; current file is test data).
5. **UI check**: verify the existing `KnowledgeBase` modal renders the per-project
   section shape; adjust if it assumes the old topics layout.

## Files to change

- `src/backend/services/knowledgeService.js` — schema, synthesis, no seed.
- `prompts/senior-analyst-synthesis.md` — new analyst prompt.
- `mcp/servers/dinah-orchestration/server.py` + backend handlers — 2 new tools.
- `src/frontend/src/components/Modals/KnowledgeBase*.jsx` — verify/adjust rendering.

## Tests (Vitest, deterministic)

- Fresh file contains empty per-project sections, no fantasy topics.
- Synthesis incorporates project file content (mocked harness).
- Tool round-trip: update → get reflects the change.

## Risks / non-goals

- Bound all file reads (count + bytes) so a large project can't blow the cycle.
- Agent-written KB content is trusted-team input; note XSS/escaping follows the existing
  900-char collapse + escaping conventions in the modal renderers.
