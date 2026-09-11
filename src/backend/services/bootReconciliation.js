import { loadHrSystem } from './hrService.js';
import { listProjects } from './projectService.js';
import { getProjectCoordination } from './coordinationService.js';
import { ensureProjectManager } from './agentLifecycle.js';
import { enqueueDirectMessage, listInbox, claimMessage, completeMessage } from './messageQueueService.js';
import { appendToSharedLog } from './messageService.js';

const BOOT_DIGEST_TYPE = 'boot-reconciliation';
const WAKEABLE = ['active', 'working', 'awaiting-user'];

function queuedBootDigests(agentId) {
  try {
    return listInbox({ agentId, limit: 20 }).filter(
      (m) => m.type === BOOT_DIGEST_TYPE && m.deliveryStatus === 'queued'
    );
  } catch {
    return [];
  }
}

// A boot digest is a point-in-time snapshot: an older unsent one is strictly
// worse than a fresh sweep. Retire stale queued digests (complete as
// superseded) instead of skipping the new send — the old skip logic deadlocked
// restarts behind a failing digest that kept re-queuing via lease expiry.
// Digests currently CLAIMED (a turn genuinely in flight) are left alone, and
// the new send is skipped for that recipient this boot.
function retireQueuedBootDigests(agentId) {
  let retired = 0;
  for (const stale of queuedBootDigests(agentId)) {
    try {
      const claim = claimMessage({ messageId: stale.messageId, agentId });
      completeMessage({ messageId: stale.messageId, agentId, leaseToken: claim.leaseToken, result: 'Superseded by a fresher boot-reconciliation digest.' });
      retired += 1;
    } catch {
      /* claimed by someone else mid-sweep; leave it */
    }
  }
  return retired;
}

function seedBootDigest({ fromAgentId = 'system', toAgentId, projectId, message }) {
  if (!toAgentId) return false;
  let status;
  try {
    status = loadHrSystem()[toAgentId]?.status;
  } catch {
    return false;
  }
  if (!WAKEABLE.includes(status)) return false;
  // Fresh snapshot wins over a stale queued one; an in-flight (claimed)
  // digest means a turn is processing — skip this recipient this boot.
  retireQueuedBootDigests(toAgentId);
  try {
    const pending = listInbox({ agentId: toAgentId, limit: 20 }).filter(
      (m) => m.type === BOOT_DIGEST_TYPE && ['queued', 'claimed', 'processing'].includes(m.deliveryStatus)
    );
    if (pending.length) return false;
    enqueueDirectMessage({ fromAgentId, toAgentId, projectId, type: BOOT_DIGEST_TYPE, message });
    return true;
  } catch {
    return false;
  }
}

function formatDigest({ projectId, openTasks, openBlockers, openHelp }) {
  const lines = [
    `Boot reconciliation for ${projectId}: the orchestrator restarted and this is where your project stands. Re-read get_project_status first — inbox items may be stale.`
  ];
  if (openTasks.length) {
    lines.push(
      `Open tasks (${openTasks.length}):\n` +
        openTasks.slice(0, 8).map((t) => `- [${t.status}] ${t.title} (assignee=${t.assignee}, id=${t.id})`).join('\n')
    );
  }
  if (openBlockers.length) {
    lines.push(
      `Open blockers (${openBlockers.length}):\n` +
        openBlockers.slice(0, 5).map((b) => `- ${b.blocker} (by=${b.agentId})`).join('\n')
    );
  }
  if (openHelp.length) {
    lines.push(
      `Open help requests (${openHelp.length}):\n` +
        openHelp.slice(0, 5).map((h) => `- ${h.question} (from=${h.agentId})`).join('\n')
    );
  }
  lines.push('Continue autonomously: allocate next steps, staff via request_staff, and track through the orchestration tools. Use ask_user only for genuine user decisions.');
  return lines.join('\n\n');
}

// Manager resolution for a sweep: prefer the manager that actually owns THIS
// project string (legacy pre-slug projects like 'hello world' have a manager
// on the unslugified id holding the real tasks). Only when no exact match
// exists, fall back to the slug guarantee (which may create the manager).
// Resolving straight to the slug would route the digest to an agent that owns
// none of the project's open work.
function resolveSweepManager(projectId) {
  try {
    const hr = loadHrSystem();
    const exact = Object.entries(hr).find(([, agent]) =>
      agent.project === projectId && agent.role === 'manager-bard' && agent.status !== 'retired'
    );
    if (exact) return { agentId: exact[0], created: false };
  } catch {
    /* fall through to the guarantee */
  }
  return ensureProjectManager(projectId);
}

// Boot-time reconciliation: after a restart no agent has been woken, and the
// dispatcher only reacts to queued mail — so managers with stalled projects
// would sleep until a human pings them. One digest per project manager with
// unfinished work (plus HR for its own backlog) restarts the loop. Workers
// are deliberately NOT swept: they wake from fresh assignments, which avoids
// a thundering herd of "need work" spam while managers are still assigning.
export function runBootReconciliation() {
  const summary = { managersNotified: [], hrNotified: false, skipped: [] };
  let projects = [];
  try {
    projects = listProjects();
  } catch {
    return summary;
  }
  for (const projectId of projects) {
    let coord;
    try {
      coord = getProjectCoordination(projectId);
    } catch {
      continue;
    }
    const openTasks = (coord.tasks || []).filter((t) => ['assigned', 'in-progress'].includes(t.status));
    const openBlockers = (coord.blockers || []).filter((b) => b.status === 'open');
    const openHelp = (coord.helpRequests || []).filter((h) => h.status === 'open');
    if (!openTasks.length && !openBlockers.length && !openHelp.length) continue;
    let managerId;
    try {
      managerId = resolveSweepManager(projectId).agentId;
    } catch {
      continue;
    }
    const ok = seedBootDigest({
      toAgentId: managerId,
      projectId,
      message: formatDigest({ projectId, openTasks, openBlockers, openHelp })
    });
    if (ok) summary.managersNotified.push(managerId);
    else summary.skipped.push(managerId);
  }

  // HR owns staffing: pending confirmations, not managers (who cannot provision).
  try {
    const hr = loadHrSystem();
    const pending = Object.entries(hr).filter(([, a]) => a.status === 'awaiting-confirmation');
    const hrCoordTasks = [];
    for (const projectId of projects) {
      try {
        const coord = getProjectCoordination(projectId);
        hrCoordTasks.push(
          ...(coord.tasks || []).filter(
            (t) => ['assigned', 'in-progress'].includes(t.status) && (t.assignee === 'hr-mind-flayer' || t.assignee?.endsWith?.('-hr-mind-flayer'))
          )
        );
      } catch {
        /* per-project best effort */
      }
    }
    if (pending.length || hrCoordTasks.length) {
      const lines = [
        'Boot reconciliation for HR: the orchestrator restarted with staffing backlog. Re-read get_project_status first — inbox items may be stale.',
        ...(pending.length
          ? [`Awaiting confirmation (${pending.length}):\n` + pending.slice(0, 8).map(([id, a]) => `- ${a.name || id} (${a.role}) in ${a.project}`).join('\n')]
          : []),
        ...(hrCoordTasks.length
          ? [`Open HR tasks (${hrCoordTasks.length}):\n` + hrCoordTasks.slice(0, 8).map((t) => `- [${t.status}] ${t.title} (id=${t.id})`).join('\n')]
          : [])
      ];
      summary.hrNotified = seedBootDigest({
        toAgentId: 'hr-mind-flayer',
        projectId: 'global',
        message: lines.join('\n\n')
      });
    }
  } catch {
    /* HR sweep is best-effort */
  }

  try {
    appendToSharedLog(
      `Boot reconciliation: notified [${summary.managersNotified.join(', ') || 'none'}]${summary.hrNotified ? ' + hr-mind-flayer' : ''}.`
    );
  } catch {
    /* logging must never break boot */
  }
  return summary;
}
