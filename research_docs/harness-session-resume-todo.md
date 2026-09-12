# DONE — harness session-resume (plan 01 follow-up)

Recorded 2026-09-11 after live probes; agy closed out 2026-09-12.

OpenCode (`-s`), Codex (`exec resume`), and `agy` (`--conversation`) all have
native resume wired in `src/backend/services/harnessRunner.js` with ids
persisted on `agent.harnessSessions` (survives restarts), stale-id recovery,
provider-switch invalidation, and compact continuation prompts on resume
(`buildContinuationPrompt` in `agentDefinitions.js`). Parser unit tests live
in `tests/backend/harness-session-reuse.test.js` (agy) and
`tests/backend/current-issues-phase2-01.test.js` (opencode/codex).

## 1. `agy` (Antigravity) — DONE 2026-09-12
- Envelope verified live: `agy --output-format json -p='...'` returns
  `{conversation_id, status, response, ...}`; `--conversation <ID>` resumes
  (nonce recall confirmed, `num_turns` 2, same id returned).
- Stale id only warns (`conversation "..." not found`) and starts a fresh
  conversation — no retry needed, just persist the returned id and log
  `ANTIGRAVITY_SESSION_RESET`.

## 2. claude / gemini / ollama CLIs — binaries absent on this host
- `which claude gemini ollama` all miss, so these adapters always take the
  `simulateHarnessExecution` fallback; there is no session to resume.
- TODO (only if a binary appears): probe `--help` for resume/session flags,
  verify with a nonce recall, then plumb like opencode/codex. Until then, no code.

## 3. Codex resume caveat (implemented, known limitation)
- `exec resume` reuses the thread's recorded cwd and rejects `--cd`, so a
  resumed thread runs in its original directory. Same-project resumes (the
  normal case) are unaffected.
- TODO: if agents ever move projects mid-life, store `{ id, project }` per
  session in `agent.harnessSessions` and start a fresh thread on project
  mismatch instead of resuming.

## 4. Eval note
- `research_docs/opencode-manager-integration-eval-investigation.md` tracks the
  separate open question of permission-bypass flags / MCP startup diagnostics
  for the OpenCode integration eval. Fail-closed behavior stays while that is
  investigated; unrelated to the resume wiring above.
