# DONE — harness session-resume (plan 01 follow-up)

Recorded 2026-09-11 after live probes; agy + claude/copilot closed out 2026-09-12.

OpenCode (`-s`), Codex (`exec resume`), `agy` (`--conversation`), `claude`
(`--resume`), and `copilot` (`--resume=`) all have native resume wired in
`src/backend/services/harnessRunner.js` with ids persisted on
`agent.harnessSessions` (survives restarts), stale-id recovery,
provider-switch invalidation, and compact continuation prompts on resume
(`buildContinuationPrompt` in `agentDefinitions.js`). Parser unit tests live
in `tests/backend/harness-session-reuse.test.js` (agy/claude/copilot) and
`tests/backend/current-issues-phase2-01.test.js` (opencode/codex). The
per-turn MCP manifest ships native configs for harnesses with one
(`opencode.json` via `OPENCODE_CONFIG`, `claude.json` via `--mcp-config`,
`copilot.json` via `--additional-mcp-config`).

## 1. `agy` (Antigravity) — DONE 2026-09-12
- Envelope verified live: `agy --output-format json -p='...'` returns
  `{conversation_id, status, response, ...}`; `--conversation <ID>` resumes
  (nonce recall confirmed, `num_turns` 2, same id returned).
- Stale id only warns (`conversation "..." not found`) and starts a fresh
  conversation — no retry needed, just persist the returned id and log
  `ANTIGRAVITY_SESSION_RESET`.

## 2. claude — WIRED 2026-09-12, recall unverified (no credits)
- Envelope verified live: `claude -p --output-format json` returns a single
  result object `{type:'result', session_id, result, is_error, ...}` (observed
  on a credit-failure turn: `is_error:true`, `result:'Credit balance is too
  low'`, exit 0).
- Resume via `--resume <session-id>` (documented in `claude --help`); new
  sessions pass an explicit `--session-id` UUID. Recall is UNVERIFIED — no
  credits on this host — so the wiring is provisional. `is_error` turns fall
  back to the simulator so the dispatcher re-queues instead of consuming.
- Stale-id behavior is unknown; the adapter clears + retries once on
  session-not-found-shaped output. Re-verify with a nonce recall when credits
  allow.

## 3. copilot — WIRED + VERIFIED live 2026-09-12
- `copilot -p --allow-all-tools --output-format json` emits JSONL ending in a
  `result` line with `sessionId`; text comes from the final
  `assistant.message` (deltas joined as fallback). Parser: `parseCopilotJsonOutput`.
- Nonce recall confirmed: `--resume=<id>` returns the same sessionId and the
  recalled nonce. Client-generated `--session-id=<uuid>` for new sessions is
  verified adopted (same id echoed back).
- Stale id exits 0 with `Error: No session, task, or name matched '...'` on
  stderr and no JSON — clear + retry once as new.
- No `models` subcommand exists, so discovery is static (`mai-code-1.1-flash`
  observed live as the auto-resolved model, plus documented `auto`).
- Like codex, a resume reuses the session's recorded cwd (same-project
  resumes unaffected).

## 4. gemini / ollama CLIs — binaries absent on this host
- `which gemini ollama` both miss, so these adapters always take the
  `simulateHarnessExecution` fallback; there is no session to resume.
- TODO (only if a binary appears): probe `--help` for resume/session flags,
  verify with a nonce recall, then plumb like opencode/codex. Until then, no code.

## 5. Codex resume caveat (implemented, known limitation)
- `exec resume` reuses the thread's recorded cwd and rejects `--cd`, so a
  resumed thread runs in its original directory. Same-project resumes (the
  normal case) are unaffected.
- TODO: if agents ever move projects mid-life, store `{ id, project }` per
  session in `agent.harnessSessions` and start a fresh thread on project
  mismatch instead of resuming.

## 6. Eval note
- `research_docs/opencode-manager-integration-eval-investigation.md` tracks the
  separate open question of permission-bypass flags / MCP startup diagnostics
  for the OpenCode integration eval. Fail-closed behavior stays while that is
  investigated; unrelated to the resume wiring above.
