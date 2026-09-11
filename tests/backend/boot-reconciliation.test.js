import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated workspace so boot/dedupe tests never touch the real working-area.
const testPaths = vi.hoisted(() => {
  const workingDir = '/tmp/dnd-boot-dedupe-vitest';
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

import { saveHrSystem, loadHrSystem } from '../../src/backend/services/hrService.js';
import { clearAgentEventQueue } from '../../src/backend/services/eventBus.js';
import { createProjectFolder } from '../../src/backend/services/projectService.js';
import {
  recordTask,
  updateTaskProgress,
  requestHelp
} from '../../src/backend/services/coordinationService.js';
import {
  listInbox,
  getQueuedAgents
} from '../../src/backend/services/messageQueueService.js';
import { runBootReconciliation } from '../../src/backend/services/bootReconciliation.js';

function agent(name, role, project = 'boot-proj', status = 'active') {
  return {
    name,
    role,
    project,
    status,
    harness: 'system-simulator',
    model: 'system-simulator/balanced-agent',
    effortLevel: 'Medium',
    context_len: 128000,
    context_used: 1000,
    last_activity_ms: Date.now(),
    tasks_total: 5,
    tasks_completed: 0,
    mcp: {}
  };
}

function resetWorkspace() {
  fs.rmSync(testPaths.workingDir, { recursive: true, force: true });
  fs.mkdirSync(testPaths.sharedStateDir, { recursive: true });
  fs.mkdirSync(testPaths.hrSystemDir, { recursive: true });
  fs.mkdirSync(testPaths.projectsDir, { recursive: true });
}

function readCoordination() {
  return JSON.parse(fs.readFileSync(path.join(testPaths.sharedStateDir, 'coordination.json'), 'utf8'));
}

describe('Boot reconciliation sweep', () => {
  beforeAll(() => resetWorkspace());
  afterAll(() => fs.rmSync(testPaths.workingDir, { recursive: true, force: true }));
  beforeEach(() => {
    resetWorkspace();
    saveHrSystem({
      'boot-proj-manager-bard': agent('Manager', 'manager-bard'),
      'boot-proj-backend-dev-cleric': agent('Dev', 'backend-dev-cleric'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
    createProjectFolder('boot-proj');
  });

  it('nudges the manager of a dirty project, not the workers', () => {
    recordTask({
      projectId: 'boot-proj',
      title: 'Stalled slice',
      assignee: 'boot-proj-backend-dev-cleric',
      createdBy: 'boot-proj-manager-bard',
      notify: false
    });
    const summary = runBootReconciliation();
    expect(summary.managersNotified).toContain('boot-proj-manager-bard');
    const inbox = listInbox({ agentId: 'boot-proj-manager-bard' });
    const digest = inbox.find((m) => m.type === 'boot-reconciliation');
    expect(digest).toBeDefined();
    expect(digest.summary).toMatch(/Stalled slice/);
    expect(digest.summary).toMatch(/Re-read get_project_status/);
    expect(getQueuedAgents()).toContain('boot-proj-manager-bard');
    // Workers are deliberately not swept.
    expect(listInbox({ agentId: 'boot-proj-backend-dev-cleric' })).toEqual([]);
  });

  it('skips clean projects and paused managers', () => {
    createProjectFolder('clean-proj');
    const summary = runBootReconciliation();
    expect(summary.managersNotified).toEqual([]);

    recordTask({
      projectId: 'boot-proj',
      title: 'Work',
      assignee: 'boot-proj-backend-dev-cleric',
      createdBy: 'boot-proj-manager-bard',
      notify: false
    });
    const hr = loadHrSystem();
    hr['boot-proj-manager-bard'].status = 'paused';
    saveHrSystem(hr);
    const second = runBootReconciliation();
    expect(second.managersNotified).toEqual([]);
    expect(listInbox({ agentId: 'boot-proj-manager-bard' })).toEqual([]);
  });

  it('double run does not stack a second digest', () => {
    recordTask({
      projectId: 'boot-proj',
      title: 'Work',
      assignee: 'boot-proj-backend-dev-cleric',
      createdBy: 'boot-proj-manager-bard',
      notify: false
    });
    runBootReconciliation();
    runBootReconciliation();
    const all = listInbox({ agentId: 'boot-proj-manager-bard', includeCompleted: true })
      .filter((m) => m.type === 'boot-reconciliation');
    expect(all.filter((m) => m.deliveryStatus === 'queued').length).toBe(1);
  });

  it('stale queued digest is superseded, not left blocking the fresh one', () => {
    recordTask({
      projectId: 'boot-proj',
      title: 'Work',
      assignee: 'boot-proj-backend-dev-cleric',
      createdBy: 'boot-proj-manager-bard',
      notify: false
    });
    runBootReconciliation();
    // Simulate lease-expiry redelivery of the failing digest (the live bug:
    // a re-queued stale digest used to veto the fresh sweep).
    runBootReconciliation();
    const all = listInbox({ agentId: 'boot-proj-manager-bard', includeCompleted: true })
      .filter((m) => m.type === 'boot-reconciliation');
    const queued = all.filter((m) => m.deliveryStatus === 'queued');
    const superseded = all.filter((m) => m.deliveryStatus === 'completed');
    expect(queued.length).toBe(1);
    expect(superseded.length).toBe(1);
    expect(queued[0].messageId).not.toBe(superseded[0].messageId);
  });

  it('nudges HR for pending confirmations, skips HR when clean', () => {    const clean = runBootReconciliation();
    expect(clean.hrNotified).toBe(false);

    const hr = loadHrSystem();
    hr['boot-proj-qa-engineer-rogue'] = { ...agent('QA', 'qa-engineer-rogue'), status: 'awaiting-confirmation' };
    saveHrSystem(hr);
    const dirty = runBootReconciliation();
    expect(dirty.hrNotified).toBe(true);
    const hrInbox = listInbox({ agentId: 'hr-mind-flayer' });
    expect(hrInbox.some((m) => m.type === 'boot-reconciliation' && String(m.summary).includes('Awaiting confirmation'))).toBe(true);
  });

  it('legacy spaced project notifies its exact manager, not the slug twin', () => {
    // Literal pre-slug directory (createProjectFolder would slugify).
    fs.mkdirSync(path.join(testPaths.projectsDir, 'hello world'), { recursive: true });
    // The slug twin exists but has no work of its own — it must stay silent,
    // proving the digest routes to the work owner, not the slug.
    fs.mkdirSync(path.join(testPaths.projectsDir, 'hello-world'), { recursive: true });
    saveHrSystem({
      'hello world-manager-bard': agent('Legacy Manager', 'manager-bard', 'hello world'),
      'hello-world-manager-bard': agent('Slug Manager', 'manager-bard', 'hello-world'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    recordTask({
      projectId: 'hello world',
      title: 'Legacy slice',
      assignee: 'hello world-manager-bard',
      createdBy: 'hello world-manager-bard',
      notify: false
    });
    const summary = runBootReconciliation();
    expect(summary.managersNotified).toContain('hello world-manager-bard');
    expect(summary.managersNotified).not.toContain('hello-world-manager-bard');
    expect(
      listInbox({ agentId: 'hello world-manager-bard' }).some((m) => m.type === 'boot-reconciliation')
    ).toBe(true);
  });

  it('falls back to the slug guarantee when no exact manager exists', () => {
    fs.mkdirSync(path.join(testPaths.projectsDir, 'fresh proj'), { recursive: true });
    saveHrSystem({
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    // Seed open work directly so the sweep has something to report. The
    // assignee is verbatim (no roster yet); the sweep must still ensure a
    // manager and notify it.
    recordTask({
      projectId: 'fresh proj',
      title: 'Orphan slice',
      assignee: 'ghost-role',
      createdBy: 'orchestrator',
      notify: false
    });
    const summary = runBootReconciliation();
    expect(summary.managersNotified).toContain('fresh-proj-manager-bard');
    expect(loadHrSystem()['fresh-proj-manager-bard']).toBeDefined();
  });
});

describe('Idempotent task creation (stale-read race guard)', () => {
  beforeAll(() => resetWorkspace());
  afterAll(() => fs.rmSync(testPaths.workingDir, { recursive: true, force: true }));
  beforeEach(() => {
    resetWorkspace();
    saveHrSystem({
      'boot-proj-manager-bard': agent('Manager', 'manager-bard'),
      'boot-proj-backend-dev-cleric': agent('Dev', 'backend-dev-cleric'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
  });

  function countTasks() {
    return readCoordination().projects['boot-proj'].tasks.length;
  }

  it('identical re-create collapses to the open task', () => {
    const first = recordTask({
      projectId: 'boot-proj',
      title: 'Build it',
      description: 'same scope',
      assignee: 'backend-dev-cleric',
      acceptanceCriteria: ['done'],
      createdBy: 'boot-proj-manager-bard',
      notify: false
    });
    expect(first.duplicate).toBeUndefined();
    const second = recordTask({
      projectId: 'boot-proj',
      title: 'Build it',
      description: 'same scope',
      assignee: 'backend-dev-cleric',
      acceptanceCriteria: ['done'],
      createdBy: 'boot-proj-manager-bard',
      notify: false
    });
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(countTasks()).toBe(1);
  });

  it('same title with expanded scope creates a new task', () => {
    const first = recordTask({
      projectId: 'boot-proj',
      title: 'Build it',
      description: 'v1 scope',
      assignee: 'backend-dev-cleric',
      createdBy: 'boot-proj-manager-bard',
      notify: false
    });
    const second = recordTask({
      projectId: 'boot-proj',
      title: 'Build it',
      description: 'v1 scope PLUS migration',
      acceptanceCriteria: ['migrated'],
      assignee: 'backend-dev-cleric',
      createdBy: 'boot-proj-manager-bard',
      notify: false
    });
    expect(second.duplicate).toBeUndefined();
    expect(second.id).not.toBe(first.id);
    expect(countTasks()).toBe(2);
  });

  it('explicit idempotencyKey dedupes; completed originals do not block', () => {
    const first = recordTask({
      projectId: 'boot-proj',
      title: 'Need work fulfillment',
      assignee: 'backend-dev-cleric',
      createdBy: 'boot-proj-manager-bard',
      notify: false,
      idempotencyKey: 'need-123'
    });
    const retry = recordTask({
      projectId: 'boot-proj',
      title: 'Completely different title',
      assignee: 'backend-dev-cleric',
      createdBy: 'boot-proj-manager-bard',
      notify: false,
      idempotencyKey: 'need-123'
    });
    expect(retry.duplicate).toBe(true);
    expect(retry.id).toBe(first.id);
    expect(countTasks()).toBe(1);

    updateTaskProgress({
      projectId: 'boot-proj',
      taskId: first.id,
      agentId: 'boot-proj-manager-bard',
      status: 'completed',
      summary: 'done'
    });
    const fresh = recordTask({
      projectId: 'boot-proj',
      title: 'Need work fulfillment',
      assignee: 'backend-dev-cleric',
      createdBy: 'boot-proj-manager-bard',
      notify: false,
      idempotencyKey: 'need-123'
    });
    expect(fresh.duplicate).toBeUndefined();
    expect(countTasks()).toBe(2);
  });

  it('window expiry allows a fresh identical task', () => {
    recordTask({
      projectId: 'boot-proj',
      title: 'Recurring check',
      assignee: 'backend-dev-cleric',
      createdBy: 'boot-proj-manager-bard',
      notify: false
    });
    // Age the task past the 15-minute mock window.
    const file = path.join(testPaths.sharedStateDir, 'coordination.json');
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.projects['boot-proj'].tasks[0].createdAt = new Date(Date.now() - 20 * 60000).toISOString();
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
    const second = recordTask({
      projectId: 'boot-proj',
      title: 'Recurring check',
      assignee: 'backend-dev-cleric',
      createdBy: 'boot-proj-manager-bard',
      notify: false
    });
    expect(second.duplicate).toBeUndefined();
    expect(countTasks()).toBe(2);
  });

  it('identical open help requests collapse', () => {
    const first = requestHelp({
      projectId: 'boot-proj',
      agentId: 'boot-proj-backend-dev-cleric',
      neededRole: 'qa-engineer-rogue',
      question: 'edge cases?'
    });
    const second = requestHelp({
      projectId: 'boot-proj',
      agentId: 'boot-proj-backend-dev-cleric',
      neededRole: 'qa-engineer-rogue',
      question: 'edge cases?'
    });
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(first.duplicate).toBeUndefined();
  });
});
