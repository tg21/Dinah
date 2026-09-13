# Process — operations (sentinels, boot reconciliation, intervals)

- **5-minute intervals**. Marshall sentinel and Senior Analyst both run on `setInterval(..., 300000)`. Do not run them more frequently than every 5 minutes without reason.
- **Marshall Sentinel** runs every 5 minutes automatically (manually: `POST /api/marshall/run`). It checks:
  - Context exhaustion (>90% used) → generates handover document
  - Stuck processes (>10 min idle in `working` status) → resets to `active`
  - Obsolete agents (tasks_completed >= tasks_total) → marks `obsolete`
- **Senior Analyst Diviner** runs every 5 minutes automatically (manually: `POST /api/knowledge-base/run-analyst`). It synthesizes project telemetry into the knowledge base.
- **Boot reconciliation**. `runBootReconciliation` (called once from `server.js` startup) sends one `boot-reconciliation` digest per project manager with unfinished work (open tasks/blockers/help) plus HR for pending confirmations/HR tasks. The digest goes to the manager owning that exact project string first (legacy pre-slug projects keep their manager), falling back to the slug guarantee only when none exists. A stale queued digest is retired (completed as superseded) so a fresh snapshot always wins; an in-flight (claimed) digest skips that recipient for the boot. Workers are never swept (they wake from fresh assignments); clean projects and paused/retired recipients are skipped. CEO/staff/analyst/marshall get no digest.
