# OpenCode manager integration eval investigation

Status: permission, workspace, and synchronous MCP callback issues fixed; harnesses now wait for process completion rather than a fixed model-duration timeout

## Reproduction

From the repository root:

```bash
npm run eval:integration -- \
  --harness opencode \
  --model opencode/muse-spark-1.3-contributor-free
```

Observed result:

```text
FAIL manager-trajectory-integration
Manager harness fell back to simulation: spawnSync /usr/bin/opencode ENOENT
```

The latest captured artifact was:

`eval-results/integration-eval-manager-1789049344004.json`

The eval fails on the first manager turn. No staffing, task, review, QA, or acceptance events are produced. The simulator output must not be treated as model behavior.

## Findings

- `/usr/bin/opencode` exists and runs normally.
- The orchestration venv exists at `.venv/dinah-orchestration`.
- The venv contains `fastmcp` and the server starts successfully.
- Generated OpenCode config uses the venv interpreter and an absolute server script path.
- Running with `DINAH_MCP_PYTHON=/usr/bin/python3` produces the same failure, so this is not caused by the venv.
- A minimal OpenCode invocation without the full eval setup succeeds.
- OpenCode 1.18.29 is installed.
- OpenCode was launched with `--auto`, but the first remaining failure was `spawnSync /usr/bin/opencode ENOENT` because the isolated eval supplied a workspace directory that did not yet exist.
- After creating the supplied workspace, OpenCode reached the MCP tools. Both tools then timed out because synchronous `execFileSync` blocked the Node backend event loop while the Python MCP server called back into it.
- OpenCode dispatch now uses asynchronous child-process execution so MCP callbacks can be served. Harness adapters no longer impose a fixed model-duration timeout; completion is driven by the child-process exit/error event.

## Main hypotheses

1. OpenCode permission handling rejects one of the MCP/server/tool actions in the isolated project invocation. The installed OpenCode 1.18.29 CLI supports `opencode run --auto`, which auto-approves permissions not explicitly denied.
2. The native temporary OpenCode MCP config is accepted syntactically but fails during MCP startup or tool discovery. Capture OpenCode stderr and its log for the exact invocation.
3. The selected free model/provider may fail or attempt an unsupported action; compare with a known-good OpenCode model while keeping the same workspace and config.
4. The `spawnSync /usr/bin/opencode ENOENT` text may be a misleading wrapper error from OpenCode/Bun or from a nested tool process. Preserve exit code, signal, stdout, stderr, and stack details before changing behavior.

## Next-session checklist

1. Run the same generated OpenCode config with a trivial prompt, then with the manager prompt, to separate provider startup from model trajectory behavior.
2. Compare the selected free model against another discovered OpenCode model.
3. Keep the eval fail-closed: never accept simulator output as a passing manager trajectory.
4. If the free model remains slow, observe its process/provider events and diagnose the provider rather than treating elapsed time as a harness failure.

## Follow-up: runner stalled its own fake collaborators (2026-09-10)

Artifact `eval-results/integration-eval-manager-1789054325841.json` got further
than any previous run — no simulation fallback, the manager asked the mock
user a scope question, requested staff, created 6 ordered tasks, and dispatched
work packets — yet the eval still failed with 6 missing trajectory steps.

Root cause was in `scripts/run-manager-integration.js`, not in the backend:

1. `plan_published` was in the golden contract but the runner never emitted
   it, so the eval could never pass.
2. Worker completion matched only the first task with `status === 'assigned'`.
   The manager moves tasks to `in_progress` (and completes setup tasks
   itself) in the same turn it creates them, and the first listed task was the
   manager-held arch task — so `task_dispatched`/`progress_reported` never
   fired and the manager waited forever for worker output.
3. Only the first `awaiting-confirmation` role got a fake collaborator while
   the manager kept requesting reviewer/QA roles that stayed pending.
4. QA targeted the first listed non-QA task instead of the worker-completed
   task, and queue reads assumed `message-queue.json` always exists.

Fix: per-turn driver now emits `plan_published` when the first task exists
(before staffing events, preserving golden order), provisions a fake for every
unserved awaiting role, completes the oldest non-review/QA/manager-held/docs
task in `assigned`/`in_progress` each turn, targets QA at the completed task,
and matches review/acceptance signals in message summaries and payloads. The
policy lives in `tests/evals/helpers/integrationDriver.js` with regression
coverage in `tests/evals/manager-integration-driver.test.js` from fixture
`tests/evals/fixtures/manager-integration-driver.regression.json`.

## Relevant code

- `scripts/run-manager-integration.js`
- `src/backend/services/harnessRunner.js`
- `src/backend/mcp/invocation.js`
- `mcp/servers/dinah-orchestration/server.py`
- `setup.sh`
