import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const testPaths = vi.hoisted(() => {
  const workingDir = '/tmp/dnd-manager-trajectory-vitest';
  const toolDir = process.cwd();
  const sharedStateDir = `${workingDir}/shared-state`;
  const hrSystemDir = `${workingDir}/hr-system`;
  const projectsDir = `${workingDir}/projects`;
  return {
    workingDir,
    toolDir,
    sharedStateDir,
    hrSystemDir,
    projectsDir,
    hrSystemFile: `${hrSystemDir}/hr-system.json`,
    projectsConfigFile: `${projectsDir}/projects-config.json`
  };
});

vi.mock('../../src/backend/config.js', () => ({
  APP_DIR: testPaths.workingDir,
  AGENT_TEMPLATES_DIR: path.join(testPaths.toolDir, 'agent-templates'),
  HR_SYSTEM_DIR: testPaths.hrSystemDir,
  HR_SYSTEM_FILE: testPaths.hrSystemFile,
  PROJECTS_DIR: testPaths.projectsDir,
  PROJECTS_CONFIG_FILE: testPaths.projectsConfigFile,
  SHARED_STATE_DIR: testPaths.sharedStateDir,
  SHIPPED_MCP_DIR: path.join(testPaths.toolDir, 'mcp'),
  SHIPPED_MCP_SERVERS_DIR: path.join(testPaths.toolDir, 'mcp', 'servers'),
  SHIPPED_MCP_REGISTRY_FILE: path.join(testPaths.toolDir, 'mcp', 'registry.json'),
  USER_MCP_DIR: path.join(testPaths.workingDir, 'user-mcps'),
  USER_MCP_SERVERS_DIR: path.join(testPaths.workingDir, 'user-mcps', 'servers'),
  USER_MCP_REGISTRY_FILE: path.join(testPaths.workingDir, 'user-mcps', 'registry.json'),
  MCP_CATALOG_URL: 'https://registry.modelcontextprotocol.io',
  TOOL_DIR: testPaths.toolDir,
  PORT: 2121,
  TOP_LEVEL_AGENT_IDS: [],
  STARTUP_SETUP_FILE: path.join(testPaths.sharedStateDir, 'startup-setup.json'),
  STARTUP_SELECTION_AUDIT_FILE: path.join(testPaths.sharedStateDir, 'startup-model-selection.json'),
  PROMPTS_DIR: path.join(testPaths.toolDir, 'prompts'),
  MARSHALL_AUDIT_FILE: path.join(testPaths.sharedStateDir, 'marshall-audit.json'),
  KNOWLEDGE_BASE_FILE: path.join(testPaths.sharedStateDir, 'knowledge-base.json'),
  DINAH_MARKER_FILE: path.join(testPaths.workingDir, '.dinah'),
  WORKING_DIR: testPaths.workingDir,
  USING_DEFAULT_WORKING_AREA: false,
  ensureBaseDirs: () => {},
  resolveFrontendDistDir: () => null,
  getTaskDedupeWindowMs: () => 900000,
  DEFAULT_TASK_DEDUPE_WINDOW_MS: 900000
}));

import trajectoryScenario from './fixtures/manager-trajectory.golden.json';
import { evaluateTrajectory } from './evaluators.js';
import { loadAgentDefinition } from '../../src/backend/services/agentDefinitions.js';
import { loadHrSystem, saveHrSystem } from '../../src/backend/services/hrService.js';
import { requestAgentSummoning } from '../../src/backend/services/agentLifecycle.js';
import { sendAgentMessage, recordTask } from '../../src/backend/services/coordinationService.js';
import { spawnHarnessAgent } from '../../src/backend/services/harnessRunner.js';
import { provisionFakeAgent, fakeQaPass, fakeWorkerComplete } from './helpers/fakeAgents.js';

const projectId = 'integration-trajectory';

function agent(name, role, project = projectId, status = 'active') {
  return {
    name,
    role,
    project,
    status,
    harness: 'system-simulator',
    model: 'system-simulator/balanced-agent',
    effortLevel: 'Medium',
    context_len: 128000,
    context_used: 0,
    last_activity_ms: Date.now(),
    mcp: {}
  };
}

describe('manager trajectory orchestration integration', () => {
  beforeAll(() => {
    fs.mkdirSync(testPaths.sharedStateDir, { recursive: true });
    fs.mkdirSync(testPaths.hrSystemDir, { recursive: true });
    fs.mkdirSync(testPaths.projectsDir, { recursive: true });
    saveHrSystem({
      'manager-bard': agent('Manager Bard', 'manager-bard'),
      'hr-mind-flayer': agent('HR Mind Flayer', 'hr-mind-flayer', 'global')
    });
  });

  afterAll(() => {
    fs.rmSync(testPaths.workingDir, { recursive: true, force: true });
  });

  it('records the manager workflow only after real orchestration operations succeed', async () => {
    const managerDefinition = loadAgentDefinition('manager-bard');
    const requiredTools = new Set([
      ...(managerDefinition.coordination?.requiredTools || []),
      ...(managerDefinition.coordination?.managerTools || [])
    ]);
    expect([...requiredTools]).toEqual(expect.arrayContaining(['request_staff', 'create_task', 'send_agent_message']));

    const events = [
      { type: 'project_brief_received', actor: 'manager-bard' },
      { type: 'plan_published', actor: 'manager-bard' }
    ];

    const staffing = requestAgentSummoning('backend-dev-cleric', projectId, { name: 'Backend Cleric' });
    expect(loadHrSystem()[staffing.agentId].status).toBe('awaiting-confirmation');
    events.push({ type: 'staff_requested', actor: 'manager-bard' });

    const worker = provisionFakeAgent('backend-dev-cleric', projectId, 'Backend Cleric');
    expect(loadHrSystem()[worker.agentId].status).toBe('active');
    events.push({ type: 'staff_provisioned', actor: 'hr-mind-flayer' });

    const task = recordTask({
      projectId,
      title: 'Implement the backend slice',
      description: 'Build the requested backend behavior.',
      // Managers receive role names in the roster, while runtime agents use
      // project-scoped ids. Coordination must canonicalize this at creation.
      assignee: worker.agent.role,
      acceptanceCriteria: ['The backend behavior is covered by tests.'],
      createdBy: 'manager-bard'
    });
    expect(task.status).toBe('assigned');
    expect(task.assignee).toBe(worker.agentId);

    const managerProgress = fakeWorkerComplete({
      projectId,
      task: { ...task, assignee: 'manager-bard' },
      summary: 'Manager has dispatched the implementation task.'
    });
    expect(managerProgress.task.status).toBe('completed');

    const dispatch = await spawnHarnessAgent(
      'system-simulator',
      projectId,
      `${task.title}\n\n${task.description}`,
      worker.agentId
    );
    expect(dispatch.simulated).toBe(true);
    events.push({ type: 'task_dispatched', actor: 'manager-bard' });

    const progress = fakeWorkerComplete({ projectId, task, summary: 'Implementation is ready for review.' }).task;
    expect(progress.percent).toBe(100);
    events.push({ type: 'progress_reported', actor: 'backend-dev-cleric' });

    const reviewMessage = sendAgentMessage({
      projectId,
      fromAgentId: 'manager-bard',
      toAgentId: worker.agentId,
      message: `Review requested for ${task.id}`
    });
    expect(reviewMessage.accepted).toBe(true);
    events.push({ type: 'review_requested', actor: 'manager-bard' });

    const qa = provisionFakeAgent('qa-engineer-rogue', projectId, 'QA Rogue');
    const qaResult = fakeQaPass({ projectId, task, qaAgentId: qa.agentId }).task;
    expect(qaResult.status).toBe('passed');
    events.push({ type: 'qa_passed', actor: 'qa-engineer-rogue' });

    const acceptance = sendAgentMessage({
      projectId,
      fromAgentId: 'manager-bard',
      toAgentId: 'hr-mind-flayer',
      message: `Acceptance reported for ${task.id}`
    });
    expect(acceptance.accepted).toBe(true);
    events.push({ type: 'acceptance_reported', actor: 'manager-bard' });

    expect(evaluateTrajectory(events, trajectoryScenario.expectedSteps)).toEqual({
      passed: true,
      failures: []
    });
  });
});
