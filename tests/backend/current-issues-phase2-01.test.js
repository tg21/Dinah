import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated workspace so Phase 2/01 tests never touch the real working-area.
const testPaths = vi.hoisted(() => {
  const workingDir = '/tmp/dnd-phase2-01-vitest';
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

// Stub harness turns (count them) but keep the real opencode JSON parser.
const harnessStub = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../src/backend/services/harnessRunner.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawnHarnessAgent: vi.fn(async (harness, projectId, prompt, agentId) => {
      harnessStub.calls.push({ harness, projectId, prompt, agentId });
      return { success: true, output: `stub-turn-${harnessStub.calls.length}`, agentId, harness, model: 'stub' };
    })
  };
});

import { buildResumePrompt } from '../../src/backend/routes/messages.js';
import { parseOpencodeJsonOutput, parseCodexJsonOutput, spawnHarnessAgent } from '../../src/backend/services/harnessRunner.js';
import { saveHrSystem, loadHrSystem } from '../../src/backend/services/hrService.js';
import { clearAgentEventQueue, getAgentEventQueue } from '../../src/backend/services/eventBus.js';
import {
  recordTask,
  updateTaskProgress,
  reportBlocker,
  requestHelp
} from '../../src/backend/services/coordinationService.js';
import {
  enqueueDirectMessage,
  listInbox,
  getQueuedAgents,
  claimMessage,
  acknowledgeMessage,
  completeMessage
} from '../../src/backend/services/messageQueueService.js';
import { runContinuation } from '../../src/backend/services/messageDispatcher.js';
import { runMarshallChecks } from '../../src/backend/services/marshallService.js';

function agent(name, role, project = 'auto-proj', status = 'active') {
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
  harnessStub.calls.length = 0;
}

describe('Phase 2/01: resume-prompt enrichment', () => {
  beforeAll(() => resetWorkspace());
  afterAll(() => fs.rmSync(testPaths.workingDir, { recursive: true, force: true }));
  beforeEach(() => {
    resetWorkspace();
    saveHrSystem({
      'auto-proj-manager-bard': agent('Manager', 'manager-bard'),
      'hr-mind-flayer': agent('HR Mind Flayer', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
  });

  it('resume prompt contains original question + tasks + reply', () => {
    const task = recordTask({
      projectId: 'auto-proj',
      title: 'Build auth slice',
      assignee: 'auto-proj-manager-bard',
      acceptanceCriteria: ['login returns 200'],
      createdBy: 'auto-proj-manager-bard',
      notify: false
    });
    const prompt = buildResumePrompt({
      agentId: 'auto-proj-manager-bard',
      projectId: 'auto-proj',
      userReply: 'proper engineering',
      pendingQuestion: { question: 'quick or proper?', taskId: null, askedAt: '2026-09-11T00:00:00.000Z' }
    });
    expect(prompt).toMatch(/quick or proper\?/);
    expect(prompt).toMatch(/Build auth slice/);
    expect(prompt).toMatch(/proper engineering/);
    expect(prompt).toMatch(/Continue autonomously/);
    expect(task.id).toBeTruthy();
  });

  it('resume prompt degrades gracefully with no context', () => {
    const prompt = buildResumePrompt({
      agentId: 'auto-proj-manager-bard',
      projectId: 'auto-proj',
      userReply: 'go',
      pendingQuestion: null
    });
    expect(prompt).toMatch(/User reply:/);
  });
});

describe('Phase 2/01: coordination-write wake-ups', () => {
  beforeAll(() => resetWorkspace());
  afterAll(() => fs.rmSync(testPaths.workingDir, { recursive: true, force: true }));
  beforeEach(() => {
    resetWorkspace();
    saveHrSystem({
      'auto-proj-manager-bard': agent('Manager', 'manager-bard'),
      'auto-proj-backend-dev-cleric': agent('Dev', 'backend-dev-cleric'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
  });

  it('worker progress wakes the manager (creator)', () => {
    const task = recordTask({
      projectId: 'auto-proj',
      title: 'Slice',
      assignee: 'auto-proj-backend-dev-cleric',
      createdBy: 'auto-proj-manager-bard',
      notify: false
    });
    // Drain the assignee seed from plan-07 path is off (notify:false); clear any queue.
    updateTaskProgress({
      projectId: 'auto-proj',
      taskId: task.id,
      agentId: 'auto-proj-backend-dev-cleric',
      status: 'in-progress',
      summary: 'endpoint wired'
    });
    expect(getQueuedAgents()).toContain('auto-proj-manager-bard');
    const inbox = listInbox({ agentId: 'auto-proj-manager-bard' });
    expect(inbox.some((m) => String(m.summary).includes(task.id))).toBe(true);
  });

  it('manager self-update stays silent (no self-wake)', () => {
    const task = recordTask({
      projectId: 'auto-proj',
      title: 'Plan',
      assignee: 'auto-proj-manager-bard',
      createdBy: 'auto-proj-manager-bard',
      notify: false
    });
    updateTaskProgress({
      projectId: 'auto-proj',
      taskId: task.id,
      agentId: 'auto-proj-manager-bard',
      status: 'in-progress',
      summary: 'planning'
    });
    expect(getQueuedAgents()).not.toContain('auto-proj-manager-bard');
  });

  it('blocker and help requests wake the project manager', () => {
    reportBlocker({ projectId: 'auto-proj', agentId: 'auto-proj-backend-dev-cleric', blocker: 'db down' });
    requestHelp({ projectId: 'auto-proj', agentId: 'auto-proj-backend-dev-cleric', neededRole: 'qa-engineer-rogue', question: 'edge cases?' });
    const inbox = listInbox({ agentId: 'auto-proj-manager-bard' });
    expect(inbox.some((m) => String(m.summary).includes('db down'))).toBe(true);
    expect(inbox.some((m) => String(m.summary).includes('edge cases?'))).toBe(true);
  });

  it('recordTask notifies the assignee unless notify:false (direct dispatch)', () => {
    const t1 = recordTask({
      projectId: 'auto-proj',
      title: 'Queued task',
      assignee: 'auto-proj-backend-dev-cleric',
      createdBy: 'auto-proj-manager-bard'
    });
    expect(listInbox({ agentId: 'auto-proj-backend-dev-cleric' }).some((m) => String(m.summary).includes(t1.id))).toBe(true);

    resetWorkspace();
    saveHrSystem({
      'auto-proj-manager-bard': agent('Manager', 'manager-bard'),
      'auto-proj-backend-dev-cleric': agent('Dev', 'backend-dev-cleric'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    recordTask({
      projectId: 'auto-proj',
      title: 'Direct task',
      assignee: 'auto-proj-backend-dev-cleric',
      createdBy: 'auto-proj-manager-bard',
      notify: false
    });
    expect(listInbox({ agentId: 'auto-proj-backend-dev-cleric' })).toEqual([]);
  });
});

describe('Phase 2/01: bounded continuation loop', () => {
  beforeAll(() => resetWorkspace());
  afterAll(() => fs.rmSync(testPaths.workingDir, { recursive: true, force: true }));
  beforeEach(() => {
    resetWorkspace();
    saveHrSystem({
      'auto-proj-manager-bard': agent('Manager', 'manager-bard'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
  });

  it('drains queued inbox until empty, then stops', async () => {
    enqueueDirectMessage({ fromAgentId: 'user', toAgentId: 'auto-proj-manager-bard', projectId: 'auto-proj', message: 'first' });
    enqueueDirectMessage({ fromAgentId: 'user', toAgentId: 'auto-proj-manager-bard', projectId: 'auto-proj', message: 'second' });
    const { turns } = await runContinuation('auto-proj-manager-bard', 5);
    expect(turns).toBe(2);
    expect(harnessStub.calls.length).toBe(2);
    expect(getQueuedAgents()).not.toContain('auto-proj-manager-bard');
    // Real turns settle their claims instead of leaving them for lease expiry.
    const done = listInbox({ agentId: 'auto-proj-manager-bard', includeCompleted: true });
    expect(done.filter((m) => m.deliveryStatus === 'completed').length).toBe(2);
  });

  it('simulator-fallback turns re-queue, then dead-letter instead of looping forever', async () => {
    // Broken-but-configured harness (like quota-blocked agy): fallback must
    // re-queue, not complete. A pure system-simulator agent would complete.
    const hr = loadHrSystem();
    hr['auto-proj-manager-bard'].harness = 'antigravity';
    saveHrSystem(hr);
    const { message } = enqueueDirectMessage({ fromAgentId: 'user', toAgentId: 'auto-proj-manager-bard', projectId: 'auto-proj', message: 'broken harness' });
    spawnHarnessAgent.mockResolvedValueOnce({ success: true, output: 'sim', simulated: true, agentId: 'auto-proj-manager-bard', harness: 'antigravity' });
    spawnHarnessAgent.mockResolvedValueOnce({ success: true, output: 'sim', simulated: true, agentId: 'auto-proj-manager-bard', harness: 'antigravity' });
    spawnHarnessAgent.mockResolvedValueOnce({ success: true, output: 'sim', simulated: true, agentId: 'auto-proj-manager-bard', harness: 'antigravity' });
    const { turns } = await runContinuation('auto-proj-manager-bard', 5);
    expect(turns).toBe(3);
    expect(getQueuedAgents()).not.toContain('auto-proj-manager-bard');
    const final = listInbox({ agentId: 'auto-proj-manager-bard', includeCompleted: true })
      .find((m) => m.messageId === message.messageId);
    expect(final.deliveryStatus).toBe('dead-lettered');
  });

  it('stops early on a fresh ask_user hold', async () => {
    enqueueDirectMessage({ fromAgentId: 'user', toAgentId: 'auto-proj-manager-bard', projectId: 'auto-proj', message: 'do it' });
    const hr = loadHrSystem();
    hr['auto-proj-manager-bard'].status = 'awaiting-user';
    hr['auto-proj-manager-bard'].pendingUserQuestion = { question: 'which?', taskId: null, askedAt: new Date().toISOString() };
    saveHrSystem(hr);
    const { turns } = await runContinuation('auto-proj-manager-bard', 5);
    expect(turns).toBe(0);
    expect(harnessStub.calls.length).toBe(0);
  });

  it('does nothing when the queue is empty', async () => {
    const { turns } = await runContinuation('auto-proj-manager-bard', 5);
    expect(turns).toBe(0);
  });
});

describe('Phase 2/01: awaiting-user watchdog', () => {
  beforeAll(() => resetWorkspace());
  afterAll(() => fs.rmSync(testPaths.workingDir, { recursive: true, force: true }));
  beforeEach(() => {
    resetWorkspace();
    const waiting = agent('Manager', 'manager-bard');
    waiting.status = 'awaiting-user';
    waiting.last_activity_ms = Date.now() - 11 * 60000;
    waiting.pendingUserQuestion = { question: 'quick or proper?', taskId: null, askedAt: new Date(Date.now() - 11 * 60000).toISOString() };
    saveHrSystem({
      'auto-proj-manager-bard': waiting,
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
  });

  it('re-broadcasts the hold without clearing it', () => {
    runMarshallChecks();
    const holds = getAgentEventQueue().filter((e) => e.type === 'agent_needs_user');
    expect(holds.length).toBeGreaterThan(0);
    const hr = loadHrSystem();
    expect(hr['auto-proj-manager-bard'].status).toBe('awaiting-user');
    expect(hr['auto-proj-manager-bard'].pendingUserQuestion.question).toMatch(/quick or proper/);
  });
});

describe('Phase 2/01: opencode native session parsing', () => {
  it('extracts text + session id from --format json output', () => {
    const stdout = [
      JSON.stringify({ type: 'step_start', sessionID: 'ses_abc123', part: {} }),
      JSON.stringify({ type: 'text', sessionID: 'ses_abc123', part: { type: 'text', text: 'Hello ' } }),
      JSON.stringify({ type: 'text', sessionID: 'ses_abc123', part: { type: 'text', text: 'world' } }),
      JSON.stringify({ type: 'step_finish', sessionID: 'ses_abc123', part: {} })
    ].join('\n');
    const parsed = parseOpencodeJsonOutput(stdout);
    expect(parsed.output).toBe('Hello world');
    expect(parsed.sessionId).toBe('ses_abc123');
  });

  it('falls back to raw stdout for non-JSON output', () => {
    const parsed = parseOpencodeJsonOutput('plain old output\nsecond line');
    expect(parsed.output).toBe('plain old output\nsecond line');
    expect(parsed.sessionId).toBeNull();
  });

  it('extracts thread id + agent text from codex exec --json output', () => {
    const stdout = [
      JSON.stringify({ type: 'thread.started', thread_id: '01a08fff-0000-0000-0000-000000000000' }),
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'PLUTO77' } }),
      JSON.stringify({ type: 'turn.completed', usage: {} })
    ].join('\n');
    const parsed = parseCodexJsonOutput(stdout);
    expect(parsed.output).toBe('PLUTO77');
    expect(parsed.sessionId).toBe('01a08fff-0000-0000-0000-000000000000');
  });

  it('codex parser falls back to raw stdout for non-JSON output', () => {
    const parsed = parseCodexJsonOutput('plain codex output');
    expect(parsed.output).toBe('plain codex output');
    expect(parsed.sessionId).toBeNull();
  });
});

describe('Queue lease robustness (acknowledge-path crash fix)', () => {
  beforeEach(() => {
    resetWorkspace();
    saveHrSystem({
      'auto-proj-manager-bard': agent('Manager', 'manager-bard'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
  });

  it('claim + acknowledge + complete accept a deliveryId as well as a messageId', () => {
    const { message } = enqueueDirectMessage({ fromAgentId: 'user', toAgentId: 'auto-proj-manager-bard', projectId: 'auto-proj', message: 'ping' });
    const inbox = listInbox({ agentId: 'auto-proj-manager-bard' });
    const deliveryId = inbox.find((m) => m.messageId === message.messageId).deliveryId;
    const claim = claimMessage({ messageId: deliveryId, agentId: 'auto-proj-manager-bard' });
    const ack = acknowledgeMessage({ messageId: deliveryId, agentId: 'auto-proj-manager-bard', leaseToken: claim.leaseToken });
    expect(ack.delivery.status).toBe('processing');
    const done = completeMessage({ messageId: deliveryId, agentId: 'auto-proj-manager-bard', leaseToken: claim.leaseToken, result: 'ok' });
    expect(done.message.deliveryStatus).toBe('completed');
  });

  it('matching holder can acknowledge after the lease timestamp passes', () => {
    const { message } = enqueueDirectMessage({ fromAgentId: 'user', toAgentId: 'auto-proj-manager-bard', projectId: 'auto-proj', message: 'slow turn' });
    const claim = claimMessage({ messageId: message.messageId, agentId: 'auto-proj-manager-bard' });
    // Simulate a long turn: lease timestamp passes with no recovery running.
    const queueFile = path.join(testPaths.sharedStateDir, 'message-queue.json');
    const qs = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    qs.deliveries.find((d) => d.deliveryId === claim.delivery.deliveryId).leaseExpiresAt = Date.now() - 1000;
    fs.writeFileSync(queueFile, JSON.stringify(qs, null, 2));
    const ack = acknowledgeMessage({ messageId: message.messageId, agentId: 'auto-proj-manager-bard', leaseToken: claim.leaseToken });
    expect(ack.delivery.status).toBe('processing');
  });

  it('wrong token or missing claim is still rejected', () => {
    const { message } = enqueueDirectMessage({ fromAgentId: 'user', toAgentId: 'auto-proj-manager-bard', projectId: 'auto-proj', message: 'guarded' });
    expect(() => acknowledgeMessage({ messageId: message.messageId, agentId: 'auto-proj-manager-bard', leaseToken: 'nope' })).toThrow(/lease/);
    const claim = claimMessage({ messageId: message.messageId, agentId: 'auto-proj-manager-bard' });
    expect(() => acknowledgeMessage({ messageId: message.messageId, agentId: 'auto-proj-manager-bard', leaseToken: 'wrong-token' })).toThrow(/lease/);
    expect(claim.leaseToken).toBeTruthy();
  });
});
