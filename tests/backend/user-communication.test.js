import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated workspace for user-communication tests (ask_user options,
// inform_user chat-only notice, chronological message-activity).
const testPaths = vi.hoisted(() => {
  const workingDir = '/tmp/dnd-user-comm-vitest';
  const toolDir = process.cwd();
  return {
    workingDir,
    toolDir,
    sharedStateDir: `${workingDir}/shared-state`,
    hrSystemDir: `${workingDir}/hr-system`,
    projectsDir: `${workingDir}/projects`,
    hrSystemFile: `${workingDir}/hr-system/hr-system.json`,
    projectsConfigFile: `${workingDir}/projects/projects-config.json`
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

import { buildResumePrompt } from '../../src/backend/routes/messages.js';
import { saveHrSystem, loadHrSystem } from '../../src/backend/services/hrService.js';
import { clearAgentEventQueue, getAgentEventQueue } from '../../src/backend/services/eventBus.js';
import { askUser, informUser } from '../../src/backend/services/coordinationService.js';
import { loadAgentMessages } from '../../src/backend/services/messageService.js';
import {
  enqueueDirectMessage,
  getProjectMessageActivity
} from '../../src/backend/services/messageQueueService.js';

function agent(name, role, project = 'auto-proj', status = 'active') {
  return {
    name, role, project, status,
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

describe('user communication: ask_user MCQ options', () => {
  beforeAll(() => resetWorkspace());
  afterAll(() => fs.rmSync(testPaths.workingDir, { recursive: true, force: true }));
  beforeEach(() => {
    resetWorkspace();
    saveHrSystem({ 'auto-proj-manager-bard': agent('Manager', 'manager-bard') });
    clearAgentEventQueue();
  });

  it('persists options and marks the chat message as a question', () => {
    const res = askUser({ projectId: 'auto-proj', agentId: 'auto-proj-manager-bard', question: 'quick or proper?', options: ['Quick', 'Proper'] });
    expect(res.options).toEqual(['Quick', 'Proper']);
    const hr = loadHrSystem();
    expect(hr['auto-proj-manager-bard'].status).toBe('awaiting-user');
    expect(hr['auto-proj-manager-bard'].pendingUserQuestion.options).toEqual(['Quick', 'Proper']);
    const msgs = loadAgentMessages('auto-proj-manager-bard').messages;
    expect(msgs.at(-1).kind).toBe('user-question');
    expect(msgs.at(-1).options).toEqual(['Quick', 'Proper']);
    expect(getAgentEventQueue().some((e) => e.type === 'agent_needs_user')).toBe(true);
  });

  it('empty options means free text and resume prompt lists options', () => {
    askUser({ projectId: 'auto-proj', agentId: 'auto-proj-manager-bard', question: 'describe it?' });
    const hr = loadHrSystem();
    expect(hr['auto-proj-manager-bard'].pendingUserQuestion.options).toEqual([]);
    const prompt = buildResumePrompt({
      agentId: 'auto-proj-manager-bard',
      projectId: 'auto-proj',
      userReply: 'x',
      pendingQuestion: { question: 'quick or proper?', options: ['Quick', 'Proper'] }
    });
    expect(prompt).toMatch(/Options you offered/);
    expect(prompt).toMatch(/1\. Quick/);
  });

  it('normalizes and caps options', () => {
    const res = askUser({
      projectId: 'auto-proj', agentId: 'auto-proj-manager-bard', question: 'pick?',
      options: [' a ', '', 42, 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']
    });
    expect(res.options.length).toBeLessThanOrEqual(10);
    expect(res.options[0]).toBe('a');
    expect(res.options).not.toContain(42);
  });
});

describe('user communication: inform_user is chat-only', () => {
  beforeAll(() => resetWorkspace());
  afterAll(() => fs.rmSync(testPaths.workingDir, { recursive: true, force: true }));
  beforeEach(() => {
    resetWorkspace();
    saveHrSystem({ 'auto-proj-manager-bard': agent('Manager', 'manager-bard') });
    clearAgentEventQueue();
  });

  it('appends to chat without pausing and never touches the durable queue', () => {
    const res = informUser({ projectId: 'auto-proj', agentId: 'auto-proj-manager-bard', message: 'Work is finished.' });
    expect(res.message).toMatch(/finished/);
    const hr = loadHrSystem();
    expect(hr['auto-proj-manager-bard'].status).toBe('active');
    const msgs = loadAgentMessages('auto-proj-manager-bard').messages;
    expect(msgs.at(-1).kind).toBe('user-inform');
    expect(getAgentEventQueue().some((e) => e.type === 'agent_informs_user')).toBe(true);
    // Durable agent-to-agent activity stays empty: chat-only notice, no leak.
    expect(getProjectMessageActivity({ projectId: 'auto-proj' })).toEqual([]);
  });
});

describe('user communication: message-activity is chronological', () => {
  beforeAll(() => resetWorkspace());
  afterAll(() => fs.rmSync(testPaths.workingDir, { recursive: true, force: true }));
  beforeEach(() => {
    resetWorkspace();
    saveHrSystem({
      'auto-proj-manager-bard': agent('Manager', 'manager-bard'),
      'auto-proj-dev': agent('Dev', 'backend-dev-cleric')
    });
    clearAgentEventQueue();
  });

  it('returns oldest first so the UI can pin the latest at the bottom', () => {
    const first = enqueueDirectMessage({ fromAgentId: 'auto-proj-manager-bard', toAgentId: 'auto-proj-dev', projectId: 'auto-proj', message: 'first msg' });
    const second = enqueueDirectMessage({ fromAgentId: 'auto-proj-dev', toAgentId: 'auto-proj-manager-bard', projectId: 'auto-proj', message: 'second msg' });
    const activity = getProjectMessageActivity({ projectId: 'auto-proj' });
    expect(activity.map((m) => m.messageId)).toEqual([first.message.messageId, second.message.messageId]);
  });
});
