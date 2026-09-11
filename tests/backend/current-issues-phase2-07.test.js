import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated workspace so Phase 2/07 tests never touch the real working-area.
const testPaths = vi.hoisted(() => {
  const workingDir = '/tmp/dnd-phase2-07-vitest';
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

import {
  requestAgentSummoning,
  confirmAgentSummoning,
  spawnAgentViaHr
} from '../../src/backend/services/agentLifecycle.js';
import { saveHrSystem } from '../../src/backend/services/hrService.js';
import { loadAgentMessages, loadAgentThoughts } from '../../src/backend/services/messageService.js';
import { clearAgentEventQueue } from '../../src/backend/services/eventBus.js';
import {
  canonicalAssignee,
  recordTask
} from '../../src/backend/services/coordinationService.js';
import {
  listInbox,
  getQueuedAgents
} from '../../src/backend/services/messageQueueService.js';

function agent(name, role, project = 'wake-proj', status = 'active') {
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

function resetWorkspace() {
  fs.rmSync(testPaths.workingDir, { recursive: true, force: true });
  fs.mkdirSync(testPaths.sharedStateDir, { recursive: true });
  fs.mkdirSync(testPaths.hrSystemDir, { recursive: true });
  fs.mkdirSync(testPaths.projectsDir, { recursive: true });
}

describe('Phase 2/07: spawned specialists get an inbox seed (dispatcher wake)', () => {
  beforeAll(() => {
    resetWorkspace();
  });

  afterAll(() => {
    fs.rmSync(testPaths.workingDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetWorkspace();
    saveHrSystem({
      'wake-proj-manager-bard': agent('Manager', 'manager-bard', 'wake-proj'),
      'hr-mind-flayer': agent('HR Mind Flayer', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
  });

  it('confirm seeds the first assigned task into the new agent inbox (dispatcher-eligible)', () => {
    const { agentId } = requestAgentSummoning('backend-dev-cleric', 'wake-proj', {
      name: 'Backend Cleric',
      requesterId: 'wake-proj-manager-bard'
    });
    const task = recordTask({
      projectId: 'wake-proj',
      title: 'Build auth slice',
      description: 'Implement login endpoint',
      assignee: agentId,
      acceptanceCriteria: ['login returns 200'],
      createdBy: 'wake-proj-manager-bard'
    });

    confirmAgentSummoning(agentId, {});

    const inbox = listInbox({ agentId });
    expect(inbox.length).toBeGreaterThan(0);
    const seed = inbox.find((m) => String(m.summary).includes(task.id));
    expect(seed).toBeDefined();
    expect(seed.summary).toMatch(/Build auth slice/);
    expect(seed.summary).toMatch(/login returns 200/);
    // Dispatcher wake eligibility: agent has queued deliveries.
    expect(getQueuedAgents()).toContain(agentId);
    // Worker drawer projection carries the task content.
    const drawer = loadAgentMessages(agentId).messages;
    expect(drawer.some((m) => String(m.request).includes(task.id))).toBe(true);
    // Observability thought.
    expect(loadAgentThoughts(agentId).some((t) => t.step === 'SPAWN_WAKE')).toBe(true);
  });

  it('direct spawn seeds a pre-assigned exact-ID task', () => {
    const expectedId = 'wake-proj-backend-dev-cleric';
    const task = recordTask({
      projectId: 'wake-proj',
      title: 'Wire cache',
      assignee: expectedId,
      acceptanceCriteria: ['hit rate logged'],
      createdBy: 'wake-proj-manager-bard'
    });

    const { agentId } = spawnAgentViaHr('backend-dev-cleric', 'wake-proj', 'Backend Cleric', {});
    expect(agentId).toBe(expectedId);

    const inbox = listInbox({ agentId });
    const seed = inbox.find((m) => String(m.summary).includes(task.id));
    expect(seed).toBeDefined();
    expect(getQueuedAgents()).toContain(agentId);
  });

  it('direct spawn seeds a role-name (legacy) assignment via role fallback', () => {
    const task = recordTask({
      projectId: 'wake-proj',
      title: 'Legacy slice',
      assignee: 'backend-dev-cleric',
      createdBy: 'wake-proj-manager-bard'
    });
    // No worker exists yet: canonicalAssignee stores the bare role verbatim.
    expect(task.assignee).toBe('backend-dev-cleric');

    const { agentId } = spawnAgentViaHr('backend-dev-cleric', 'wake-proj', 'Backend Cleric', {});
    const inbox = listInbox({ agentId });
    expect(inbox.some((m) => String(m.summary).includes(task.id))).toBe(true);
  });

  it('spawn with zero tasks seeds a check-in nudge, not an empty harness turn', () => {
    const { agentId } = spawnAgentViaHr('qa-engineer-rogue', 'wake-proj', 'QA Rogue', {});
    const inbox = listInbox({ agentId });
    expect(inbox.length).toBeGreaterThan(0);
    expect(inbox.some((m) => String(m.summary).includes('No assigned tasks yet'))).toBe(true);
    expect(getQueuedAgents()).toContain(agentId);
  });

  it('no wake before approval: awaiting-confirmation agent gets no deliveries', () => {
    const { agentId } = requestAgentSummoning('backend-dev-cleric', 'wake-proj', {
      requesterId: 'wake-proj-manager-bard'
    });
    expect(listInbox({ agentId })).toEqual([]);
    expect(getQueuedAgents()).not.toContain(agentId);
  });

  it('dispatch-by-role-name still resolves instead of 404 (07 groundwork lock)', () => {
    saveHrSystem({
      'wake-proj-manager-bard': agent('Manager', 'manager-bard', 'wake-proj'),
      'wake-proj-backend-dev-cleric': agent('Dev', 'backend-dev-cleric', 'wake-proj'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    expect(canonicalAssignee('wake-proj', 'backend-dev-cleric')).toBe('wake-proj-backend-dev-cleric');
  });
});
