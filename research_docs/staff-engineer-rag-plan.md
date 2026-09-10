# Staff Engineer Cross-Project RAG Plan

Date: 2026-09-10
Status: Proposal (Phase 1 scoped)
Decisions: scope = Projects + KB topics; ranking = BM25-first with pluggable embeddings later; tool surface = extend `dinah-orchestration` MCP.

## 1. Problem

The Staff Engineer (`staff-engineer-paladin`) is expected to answer questions across all projects it can access, but today it has no cross-project read path:

- Its coordination tools (`get_project_status`, `update_progress`, `report_blocker`, `request_help`, `send_agent_message`) are project-scoped — one call per `projectId`.
- The knowledge base (`src/backend/services/knowledgeService.js`) is a flat `topics[]` plus `projectSummaries{}` (fileCount + first 8 filenames), queried by substring match (`POST /api/knowledge-base/query`).
- Repeated cross-project questions ("how do we do auth / migrations / event-bus here?") force re-scans or hallucination.

Goal: give the Staff Engineer repeatable, cited retrieval over project docs + KB topics, with caching for repeated questions, fitting current architecture and constraints (offline-capable, deterministic tests, no new API keys).

## 2. Current architecture touchpoints

| Area | File | Role in plan |
|---|---|---|
| Staff role definition | `agent-templates/staff-engineer-paladin.json` | Add retrieval protocol to effective prompt (via code, not template edit if avoidable) |
| Prompt builder | `src/backend/services/agentDefinitions.js` (`buildAgentPrompt`) | Append "Retrieval protocol" block for `staff-engineer-paladin` |
| Knowledge service | `src/backend/services/knowledgeService.js` | Keep as curator; Analyst cycle triggers index rebuild |
| Knowledge routes | `src/backend/routes/knowledge.js` | Upgrade `/api/knowledge-base/query` to BM25 + snippets + project badges |
| Orchestration MCP | `mcp/servers/dinah-orchestration/server.py` | Add 3 retrieval tools via existing `context()` + `call_backend()` pattern |
| Orchestration backend | `src/backend/routes/*` + `services/*` (`/api/internal/orchestration/*`) | New handlers with role-gated access control |
| Invocation manifest | `src/backend/mcp/invocation.js` | No change needed (reuse orchestration MCP surface) |
| Analyst scheduler | `runSeniorAnalystInspection` (5-min cycle) | Trigger incremental index rebuild |
| Config / state | `src/backend/config.js`, `working-area/shared-state/` | New `knowledge-index.json`, `knowledge-query-cache.json` |
| UI | `src/components/Modals/KnowledgeBase`, drawer Messages tab | Search box + citation chips (minimal) |

## 3. Design: BM25-first RAG

### 3.1 New retrieval service — `src/backend/services/knowledgeRetrieval.js`

Pure-JS, zero new npm dependencies (keeps `npm test` offline/deterministic):

- **Corpus builders** (in scope only — no chat/thought indexing):
  - KB topics → one chunk each (title + summary + tags + category).
  - Each project → chunks from `README.md` + other root markdown (cap ~8 KB/chunk with overlap), `shared-state/coordination.json` tasks (title + acceptance criteria + status/summary), blockers/help requests (redacted summaries only).
- **Tokenizer + BM25 scorer** (~100 lines): lowercase, stopword strip, TF/IDF with field weights (title 3x, tags 2x, body 1x).
- **Pluggable embedder interface**: `scoreChunk(query, chunk, { embedder })` where `embedder` defaults to `null` (BM25 only). When Ollama (`nomic-embed-text`) or a harness embedding endpoint exists, add cosine as a blended score. No behavior change until then.
- **Persistence**:
  - `shared-state/knowledge-index.json` → `{ chunks[], docFreq, updatedAt }`
  - `shared-state/knowledge-query-cache.json` → `{ queryHash → results, hits }`

### 3.2 Index refresh policy

- Rebuild incrementally on the existing Senior Analyst 5-min cycle (`runSeniorAnalystInspection` calls `rebuildKnowledgeIndex()`), plus lazy rebuild if the index is older than newest project mtime.
- **Repeated-question fast path**: LRU cache (e.g. 100 entries, 30-min TTL) in front of BM25. Cache hit increments `hits`; queries with `hits >= N` are candidates for promotion to a durable KB `topic` by the Analyst ("golden answers").
- **Redaction at index time**: skip `projects-config.json`, `*.msgs.json`, secrets/keys, large logs — store invariant metadata (projectId, chunk type, status) instead, mirroring eval-fixture redaction rules.

### 3.3 MCP tools (extend `dinah-orchestration`)

| Tool | Purpose | Backend handler |
|---|---|---|
| `query_knowledge(query, projectIds[]?, topK=5)` | BM25 search across KB topics + project chunks. Returns `{ chunkId, projectId, title, snippet, score }` with citations. | `POST /api/internal/orchestration/query-knowledge` |
| `list_project_docs(projectId)` | Cheap manifest (filenames + README excerpt) for targeted follow-up reads without full scans. | `POST /api/internal/orchestration/list-docs` |
| `get_decision_log(projectIds[]?, limit)` | Completed tasks + resolved blockers = "why did we decide X" answers. | `POST /api/internal/orchestration/decision-log` |

Follow the existing `server.py` pattern: `context()` injects `agentId`/`projectId`, `call_backend()` forwards with `DND_MCP_TOKEN`. No service URLs in prompts.

### 3.4 Access control (backend-enforced)

Read `DND_AGENT_ID` role from HR; do not rely on prompt instructions:

- Cross-project: `staff-engineer-paladin`, `senior-analyst-diviner`, CEO.
- Own-project only (+ shared KB topics): `manager-bard` and all other project-scoped roles.
- Everyone gets shared KB topics; project chunks are filtered by allowed `projectIds`.

This preserves the HR boundary (`AGENTS.md` §4).

### 3.5 Prompt injection

Extend `buildAgentPrompt()` in `agentDefinitions.js`: when `role === 'staff-engineer-paladin'`, append a "Retrieval protocol" block:

> Use `query_knowledge` before answering cross-project questions; cite `projectId:chunkId`; say "not found in indexed docs" rather than inventing.

Agent discovers everything through MCP tools; no embedded endpoints/credentials.

### 3.6 UI (minimal)

- `KnowledgeBase` modal: search box wired to upgraded `POST /api/knowledge-base/query` (BM25 + snippets + project badges).
- Optional/deferred: citation chips in drawer Messages tab.

## 4. Rollout

- **Phase 1 — BM25 + 3 MCP tools (this proposal)**: `knowledgeRetrieval.js`, wire into `knowledge.js` routes + Analyst cycle, 3 new orchestration tools with role gating, staff prompt block, Vitest golden fixtures under `tests/evals/fixtures/` (e.g. "auth pattern Q returns project-alpha chunk, not hallucination").
- **Phase 2 — only if BM25 precision disappoints**: Ollama `nomic-embed-text` embedder behind the interface, cosine+BM25 hybrid, still offline. No API keys.
- **Phase 3 — only if privilege separation hurts**: split to a `dinah-knowledge` MCP gated to staff/analyst. Deferred — doubles invocation-manifest work (`mcp/invocation.js`, OpenCode native config) for no retrieval benefit now.

## 5. Tradeoffs / risks

- BM25 misses paraphrases ("auth" vs "login") — mitigate with tag/alias expansion in chunk metadata + promoting repeated questions to curated topics.
- Index staleness (5-min window) — acceptable for Q&A; `list_project_docs` + `get_project_status` remain live-read fallbacks.
- `coordination.json` bloat — cap task description length; index title/criteria/status/summary only.
- Scope discipline: message/thought history explicitly out of v1 (noise + privacy). Revisit only with redaction + retention policy.

## 6. Acceptance sketch (Phase 1)

- [ ] `query_knowledge("event bus")` returns KB `topic-arch-1` chunk with citation before fix; regression fixture added under `tests/evals/fixtures/`.
- [ ] Staff Engineer restricted to indexed docs: unknown-topic query returns "not found", no invented project details.
- [ ] Non-staff role querying another project gets filtered/denied at the backend handler.
- [ ] Repeated identical query hits `knowledge-query-cache.json` (hit counter increments, no rescore).
- [ ] `npm test` passes offline with no harness CLI, API keys, or network.
- [ ] `AGENTS.md` updated if any workflow/endpoint convention changes.
