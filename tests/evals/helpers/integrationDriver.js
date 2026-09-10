/**
 * Pure decision helpers for the LLM-driven manager integration eval
 * (scripts/run-manager-integration.js).
 *
 * The runner advances fake collaborators between manager turns. These
 * helpers encode that policy so it can be covered by deterministic tests;
 * see tests/evals/manager-integration-driver.test.js and the regression
 * fixture it loads.
 */

export function hasPublishedPlan(tasks) {
  return Array.isArray(tasks) && tasks.length > 0;
}

/**
 * Every non-manager agent parked in awaiting-confirmation that has not been
 * served yet needs a fake collaborator. Managers request simplified role
 * names and keep requesting while earlier roles wait, so serving only the
 * first entry stalls review/QA forever.
 */
export function selectAwaitingStaff(roster, projectId, alreadyProvisioned = []) {
  const served = new Set(alreadyProvisioned);
  return Object.entries(roster || {})
    .filter(([agentId, agent]) =>
      agent?.project === projectId &&
      agent.status === 'awaiting-confirmation' &&
      agent.role !== 'manager-bard' &&
      !served.has(agentId)
    )
    .map(([agentId, agent]) => ({ agentId, ...agent }));
}

export function isReviewQaTask(task) {
  return /qa|review/i.test(String(task?.assignee || '')) ||
    /qa|review/i.test(String(task?.title || ''));
}

export function isDocsTask(task) {
  return /doc/i.test(String(task?.title || ''));
}

/**
 * Oldest implementation task that a fake worker may complete. Managers move
 * tasks to in_progress (and finish setup tasks themselves) in the same turn
 * they create them, so matching only status === 'assigned' never fires and
 * the eval deadlocks waiting for worker output.
 */
export function selectImplementationTask(tasks, { managerId = null, qaPassed = false } = {}) {
  return (tasks || []).find((task) =>
    ['assigned', 'in_progress'].includes(task.status) &&
    task.assignee !== 'manager-bard' &&
    task.assignee !== managerId &&
    !isReviewQaTask(task) &&
    (qaPassed || !isDocsTask(task))
  ) || null;
}

export function managerMessageMatches(messages, { projectId, managerId, pattern }) {
  return (messages || []).some((message) =>
    message.projectId === projectId &&
    message.senderAgentId === managerId &&
    pattern.test(`${message.summary || ''}\n${message.payload?.message || ''}`)
  );
}

/**
 * QA validates the worker-completed implementation task, not whatever task
 * happens to be listed first (which may be an already-finished setup task).
 */
export function selectQaTarget(tasks, completedTaskId) {
  const list = tasks || [];
  return list.find((task) => task.id === completedTaskId)
    || [...list].reverse().find((task) =>
      ['completed', 'in_progress', 'assigned'].includes(task.status) && !isReviewQaTask(task)
    )
    || null;
}
