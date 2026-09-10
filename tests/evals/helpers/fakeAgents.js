import { loadHrSystem } from '../../../src/backend/services/hrService.js';
import { spawnAgentViaHr } from '../../../src/backend/services/agentLifecycle.js';
import { recordTask, updateTaskProgress, sendAgentMessage } from '../../../src/backend/services/coordinationService.js';

const SIMULATOR = {
  harness: 'system-simulator',
  model: 'system-simulator/balanced-agent'
};

export function provisionFakeAgent(role, projectId, name = role) {
  return spawnAgentViaHr(role, projectId, name, SIMULATOR);
}

export function listProjectAgents(projectId) {
  return Object.entries(loadHrSystem())
    .filter(([, agent]) => agent.project === projectId)
    .map(([id, agent]) => ({ id, ...agent }));
}

export function fakeWorkerComplete({ projectId, task, summary = 'Fake worker completed the assigned work.' }) {
  const result = updateTaskProgress({
    projectId,
    taskId: task.id,
    agentId: task.assignee,
    status: 'completed',
    summary,
    percent: 100
  });
  return { task: result, agent: task.assignee };
}

export function fakeQaPass({ projectId, task, qaAgentId, summary = 'Fake QA agent found no regressions.' }) {
  const qaTask = recordTask({
    projectId,
    title: `QA ${task.id}`,
    description: `Validate ${task.id}.`,
    assignee: qaAgentId,
    acceptanceCriteria: ['No regression is found.'],
    dependencies: [task.id],
    createdBy: 'manager-bard'
  });
  const result = updateTaskProgress({
    projectId,
    taskId: qaTask.id,
    agentId: qaAgentId,
    status: 'passed',
    summary,
    percent: 100
  });
  return { task: result, agent: qaAgentId };
}

export function notifyManager({ projectId, fromAgentId, managerAgentId = 'manager-bard', message }) {
  return sendAgentMessage({ projectId, fromAgentId, toAgentId: managerAgentId, message });
}
