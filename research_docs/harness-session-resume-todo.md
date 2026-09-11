# TODO — harness session-resume limitations (plan 01 follow-up)

Recorded 2026-09-11 after live probes. OpenCode (`-s`) and Codex
(`exec resume`) have native resume wired in `src/backend/services/harnessRunner.js`
and verified live (nonce recall). Everything below is still one-shot.

## 1. `agy` (Antigravity) — blocked on quota, format unverified
- Flags exist: `-c/--continue`, `--conversation <ID>`, `-p/--print`,
  `--output-format json|stream-json`.
- Live probe 2026-09-11 failed with `Individual quota reached … Resets in 23h`,
  so the conversation-ID envelope was never observed.
- TODO: when quota returns, run a print turn with `--output-format json`,
  confirm where the conversation ID appears, mirror the
  `parseOpencodeJsonOutput`/`parseCodexJsonOutput` pattern
  (capture → persist on `agent.harnessSessions.agy` → `--conversation` on later
  turns → stale-ID retry), add parser unit tests in
  `tests/backend/current-issues-phase2-01.test.js`, and verify with a nonce
  recall like the opencode/codex ones.
- Rule: never wire the parser blind — an unverified envelope risks breaking the
  currently working one-shot path.

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
