# Observability & Tracing Plan — Real tokens, cost, latency, tool calls

Date: 2026-09-10
Status: Planned (not implemented)

## 1. Current state (verified in code)

- **Tokens/cost are estimated, not measured:**
  - `src/backend/routes/messages.js:98` — `round(message.length * 1.5) + 350`, added to `hr-system.json:context_used` and `projects-config.json:tokensUsed/spentUsd`.
  - `src/backend/services/agentLifecycle.js:14-38` (`calculateAgentCostEstimation`) — `3000/1500 × multiplier × RPG-registry rates`. `src/frontend/src/utils/cost.js:1-14` duplicates this heuristic for spawn preview.
- **Harness output is opaque text:** `src/backend/services/harnessRunner.js:17-70` (`runHarnessProcess`) spawns each CLI, concatenates stdout/stderr (10MB cap), broadcasts only `harness_started / harness_output (500-char snippet) / harness_completed / harness_failed`. No step/tool/usage parsing. All adapters use human-readable flags, so structured telemetry is discarded.
- **Events are ephemeral:** `src/backend/services/eventBus.js` — in-memory array, last 100, no persistence, no trace/run IDs, no SSE endpoint.
- **Best existing correlation hook:** `src/backend/mcp/invocation.js:37-51` already injects `DND_AGENT_ID / DND_PROJECT_ID / DND_MCP_TOKEN / DND_BACKEND_URL` into every harness invocation. The `dinah-orchestration` MCP server (`mcp/servers/dinah-orchestration/`) therefore sees every coordination tool call with an authoritative agent identity — currently unlogged for timing/args.

## 2. What each harness can actually emit (researched, 2026 CLIs)

| Harness | Structured mode to switch to | Real data available |
|---|---|---|
| OpenCode | `run --format json` (JSONL stream) | per-step `step_start / text / tool_use / step_finish` with `tokens{input,output,cache,reasoning}` + `cost`, `sessionID`. Caveat: known upstream bug where final `step_finish` can be dropped if loop exits on `session.status=idle` before draining — needs `export`/session-DB fallback. |
| Claude Code | `-p --output-format json` (single object) or `stream-json --verbose` (live) | `result, session_id, total_cost_usd, usage{input,output}, modelUsage, num_turns, duration_ms/duration_api_ms`; stream mode adds per-turn tool_use events. Current adapter uses `-p prompt --workdir` without JSON — must change. |
| Codex | `exec --json` (JSONL) | `thread.started / turn.started / item.started\|completed{item: command_execution, mcp_tool_call, agent_message, file_change...} / turn.completed{usage{input,cached,output,reasoning}}`. Richest tool-call stream. |
| Gemini | `-p --output-format json` (or `stream-json`) | `{response, stats.models[][tokens{prompt,candidates,total,cached,thoughts,tool}, api{requests,latency}], tools{totalCalls,byName,duration}, files{linesAdded/Removed}}`. |
| Ollama | HTTP `POST /api/generate {stream:false}` (not CLI `ollama run`) | `prompt_eval_count, eval_count, prompt_eval_duration, eval_duration, total/load_duration`. CLI gives no usage. |
| Antigravity (`agy`) | Unknown — needs spike | Assume no JSON; verify `agy --help / -p / --output-format`; fallback to wrapper-measured latency + orchestration-MCP spans + estimate marked `usage_source=estimate`. |

### Options evaluation (user's three questions)

1. **Harness-returned data via unique agent ID — RECOMMENDED as primary.** Yes, feasible. Generate `traceId/runId` per `spawnHarnessAgent` call, pass as `DND_TRACE_ID/DND_RUN_ID` env + `--title`/session label, switch each adapter to its JSON mode, parse stdout line-by-line. Gives real tokens/cost/latency/tool calls with no file locking.
2. **Logfile redirect + realtime parse — NOT recommended as primary.** Works but adds rotation/cleanup/partial-line/dual-writer races. Use only as a raw transcript archive (tee parsed JSONL to disk), never as the parse source.
3. **MCP interception — DO as complement.** Add timing + args/result logging in the orchestration MCP server keyed by the existing `DND_AGENT_ID` token. Authoritative Dinah-side tool spans even when a harness hides them (agy, simulator, fallback path).

## 3. Agreed decisions (user answers 2026-09-10)

- Storage: **append-only JSONL files per run under `shared-state/traces/`, in OTel-compatible span format** so a later OTLP migration is a field mapping, not a schema change.
- Delivery: **live streaming + post-run inspection** (stream spans via events/SSE plus persisted trace).
- Cost: **harness-reported cost first, else tokens × provider pricing table, $0 for Ollama/simulator/local.**
- Scope: **all harnesses incl. agy spike** (opencode, claude, codex, gemini, ollama + agy investigation).

## 4. Recommended architecture

### A. Correlation IDs (connect the dots now, OTLP later)

- `traceId` = per user-message run (`runId`, 32-hex OTel format). `spanId` per step/tool. `parentSpanId` links invocation → step → tool call.
- Generate in `spawnHarnessAgent`, propagate via env (`DND_TRACE_ID`, `DND_RUN_ID`, existing `DND_AGENT_ID/PROJECT_ID`) and CLI session title. Include in every eventBus event and persisted span.
- Span JSON (OTel-shaped, JSONL per line): `{traceId, spanId, parentSpanId, name, kind, startTimeUnixNano, endTimeUnixNano, status, resource{harness,model,agentId,projectId}, attributes{tokens.*,cost.usd,usage_source,tool.name/args}, events[]}`.

### B. New `src/backend/services/traceService.js`

- `startRun({agentId,projectId,harness,model}) → {traceId}`; `appendSpan()`; `endRun()` with summary (token totals, cost, latency).
- Path: `<working-area>/shared-state/traces/<agentId>/<traceId>.jsonl` (`O_APPEND` writes = lock-free for readers). Add `TRACES_DIR` to `src/backend/config.js` + `ensureBaseDirs()`.
- `usage_source` on every span: `provider_final | harness_reported | estimate | partial`.
- New `src/backend/data/pricing.js`: harness-reported cost wins (OpenCode `cost`, Claude `total_cost_usd`); else tokens × $/1M by model; `$0` for `ollama/*`, `system-simulator/*`, unknown-local.

### C. Per-harness normalizers (new `src/backend/harness/parsers/*.js`)

- One module per harness: `opencode.js, claude.js, codex.js, gemini.js, ollama.js, antigravity.js`.
- Each exposes `parseLine(jsonLine, ctx)` → zero or more OTel spans + usage delta.
- Modify `runHarnessProcess` for line-buffered JSONL parsing (handle split chunks, keep raw-text fallback), emit `trace_span` live via eventBus, tee raw stdout to the run's `.raw.jsonl` for post-mortem.
- Ollama adapter switches to HTTP API path; others add JSON flags (`--format json`, `--output-format json`/`stream-json`, `--json`). Keep human-text `output` extraction for the reply (Codex `-o`, Gemini `.response`, Claude `.result`).
- Simulator returns a synthetic span with `usage_source=estimate` + zero cost so UI contract is uniform.

### D. Backend live + query API

- Extend eventBus (or new SSE route) with `trace_span / trace_ended` events carrying `traceId/spanId`.
- New endpoints: `GET /api/traces/:traceId` (span list + summary), `GET /api/agents/:agentId/runs` (run history with totals), `GET /api/events?traceId=` filter. Mount new router in `src/backend/app.js` following existing `routes/` → `express.Router()` convention.
- On `handleSendMessage` completion, replace the `length*1.5` increment with the run's real totals and write real `spentUsd` to project config.

### E. Frontend trace visualization

- New `TracesTab` (or Drawer tab): run header (real tokens in/out/cached/reasoning, real cost, wall/API latency, harness/model), waterfall timeline of spans, tool-call list with args/result preview, raw JSONL toggle.
- Poll or SSE-subscribe during `working` status; reuse `api/client.js` + `AppContext.jsx`; collapse >900 chars per existing convention (`src/frontend/src/utils/format.js`).

### F. Testing (per AGENTS.md §7.5)

- Deterministic unit tests in `npm test`: each parser fed a checked-in golden JSONL fixture under `tests/evals/fixtures/` (redacted, stable fields only) asserting span order, token sums, cost source, parent linkage.
- Live evals stay opt-in (`npm run eval -- --harness <name> ...`); record `simulated:false`, raw response retained in `eval-results/` (git-ignored).

## 5. Phased execution

1. **Phase 0 — spike (0.5d):** confirm `agy` JSON flags; confirm OpenCode/Claude/Codex/Gemini flags against installed binaries; decide Ollama HTTP vs CLI.
2. **Phase 1 — trace core (1-2d):** `config.js:TRACES_DIR`, `traceService.js`, `pricing.js`, `traceId` generation + env propagation in `harnessRunner.js`.
3. **Phase 2 — parsers (2-3d):** one parser per harness + `runHarnessProcess` streaming + raw archive; simulator/estimate fallback.
4. **Phase 3 — MCP span logging (1d):** orchestration server logs each tool call duration/args/result with `traceId`.
5. **Phase 4 — API + replace estimates (1d):** new `/api/traces` routes; `messages.js` writes real usage; keep estimate only when `usage_source!=final`.
6. **Phase 5 — UI (1-2d):** `TracesTab` waterfall + cost/latency header; run history.
7. **Phase 6 — goldens + docs (0.5d):** fixtures, parser tests, AGENTS.md update.

## 6. Risks & mitigations

- OpenCode dropped final `step_finish` → session-export fallback + mark `usage_source=partial`.
- Claude/Codex/Gemini flag drift across versions → version-probe at startup, parser tolerant to unknown fields.
- Verbose tool args in traces → truncate + redact secrets before persisting (per golden-trace rules).
- EventBus memory cap → traces live on disk; bus carries only span summaries.

## 7. References

- `src/backend/services/harnessRunner.js:17-70` — current opaque capture point.
- `src/backend/routes/messages.js:90-117` — current estimate + dispatch point to replace.
- `src/backend/services/eventBus.js` — extend with trace events.
- `src/backend/mcp/invocation.js:37-51` — correlation env injection point.
- `src/backend/config.js` — add `TRACES_DIR`.
- Upstream docs: `opencode run --format json`, `claude -p --output-format json|stream-json`, `codex exec --json` JSONL, `gemini -p --output-format json` stats schema, Ollama `/api/generate` usage fields.
