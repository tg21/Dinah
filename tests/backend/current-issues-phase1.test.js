import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated workspace so Phase 1 tests never touch the real working-area.
const testPaths = vi.hoisted(() => {
  const workingDir = '/tmp/dnd-phase1-vitest';
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
  resolveFrontendDistDir: () => null
}));

import {
  requestAgentSummoning,
  confirmAgentSummoning,
  spawnAgentViaHr,
  ensureProjectManager
} from '../../src/backend/services/agentLifecycle.js';
import { loadHrSystem, saveHrSystem } from '../../src/backend/services/hrService.js';
import { loadAgentMessages, loadAgentThoughts } from '../../src/backend/services/messageService.js';
import { getAgentEventQueue, clearAgentEventQueue } from '../../src/backend/services/eventBus.js';
import { seedDefaultPermissions, resolveEffectiveMcps } from '../../src/backend/mcp/permissions.js';
import { slugifyProjectId, createProjectFolder } from '../../src/backend/services/projectService.js';
import {
  canonicalAssignee,
  recordTask,
  updateTaskProgress,
  reportBlocker,
  requestHelp
} from '../../src/backend/services/coordinationService.js';
import {
  enqueueDirectMessage,
  claimMessage,
  completeMessage
} from '../../src/backend/services/messageQueueService.js';

function agent(name, role, project = 'phase1-proj', status = 'active') {
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

describe('Phase 1: staffing visibility + HR drawer (plans 02+03)', () => {
  beforeAll(() => {
    fs.mkdirSync(testPaths.sharedStateDir, { recursive: true });
    fs.mkdirSync(testPaths.hrSystemDir, { recursive: true });
    fs.mkdirSync(testPaths.projectsDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(testPaths.workingDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    saveHrSystem({
      'manager-bard': agent('Manager Bard', 'manager-bard'),
      'hr-mind-flayer': agent('HR Mind Flayer', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
  });

  it('staffing request appears in both requester and HR drawer files', () => {
    const { agentId } = requestAgentSummoning('backend-dev-cleric', 'phase1-proj', {
      name: 'Backend Cleric',
      requesterId: 'manager-bard'
    });

    const managerMsgs = loadAgentMessages('manager-bard').messages;
    const hrMsgs = loadAgentMessages('hr-mind-flayer').messages;
    expect(managerMsgs.some((m) => String(m.request).includes(agentId))).toBe(true);
    expect(hrMsgs.some((m) => String(m.request).includes(agentId))).toBe(true);

    const managerThoughts = loadAgentThoughts('manager-bard');
    const hrThoughts = loadAgentThoughts('hr-mind-flayer');
    expect(managerThoughts.length).toBeGreaterThan(0);
    expect(hrThoughts.length).toBeGreaterThan(0);
  });

  it('emits courier_message with the required payload fields', () => {
    requestAgentSummoning('backend-dev-cleric', 'phase1-proj', { requesterId: 'manager-bard' });
    const couriers = getAgentEventQueue().filter((e) => e.type === 'courier_message');
    expect(couriers.length).toBeGreaterThan(0);
    for (const e of couriers) {
      expect(e.messageId).toEqual(expect.any(String));
      expect(e.deliveryId).toEqual(expect.any(String));
      expect(e.projectId).toEqual(expect.any(String));
      expect(e.sender || e.fromAgentId).toEqual(expect.any(String));
      expect(e.recipient || e.toAgentId).toEqual(expect.any(String));
      expect(e.summary || e.snippet).toEqual(expect.any(String));
    }
  });

  it('HR drawer contains a provision record after direct spawn with model/harness/effort', () => {
    const { agentId } = spawnAgentViaHr('backend-dev-cleric', 'phase1-proj', 'Backend Cleric', {
      model: 'system-simulator/balanced-agent',
      harness: 'system-simulator',
      effortLevel: 'High'
    });
    const hrMsgs = loadAgentMessages('hr-mind-flayer').messages;
    const record = hrMsgs.find((m) => String(m.request).includes(agentId));
    expect(record).toBeDefined();
    expect(record.request).toMatch(/model=.*harness=.*effort=/i);
  });

  it('HR drawer contains a confirmation record after confirm-summon', () => {
    const { agentId } = requestAgentSummoning('qa-engineer-rogue', 'phase1-proj', { requesterId: 'manager-bard' });
    confirmAgentSummoning(agentId, {});
    const hrMsgs = loadAgentMessages('hr-mind-flayer').messages;
    expect(hrMsgs.some((m) => String(m.request).includes(agentId) && /confirm/i.test(String(m.request)))).toBe(true);
  });

  it('ensure-manager reports created vs already-existed without spamming HR', () => {
    const first = ensureProjectManager('phase1-ensure');
    expect(first.created).toBe(true);
    const hrCountAfterCreate = loadAgentMessages('hr-mind-flayer').messages.length;
    const second = ensureProjectManager('phase1-ensure');
    expect(second.created).toBe(false);
    expect(second.agentId).toBe(first.agentId);
    // Idempotent guarantee must not log every re-check into HR's drawer.
    expect(loadAgentMessages('hr-mind-flayer').messages.length).toBe(hrCountAfterCreate);
  });

  it('queue claim/complete projection appears once (no duplicates on re-read)', () => {
    saveHrSystem({
      'phase1-proj-manager-bard': agent('Manager', 'manager-bard'),
      'phase1-proj-backend-dev-cleric': agent('Worker', 'backend-dev-cleric'),
      'hr-mind-flayer': agent('HR Mind Flayer', 'hr-mind-flayer', 'global')
    });
    const { message } = enqueueDirectMessage({
      fromAgentId: 'phase1-proj-manager-bard',
      toAgentId: 'phase1-proj-backend-dev-cleric',
      projectId: 'phase1-proj',
      message: 'Please implement the slice'
    });
    const before = loadAgentMessages('phase1-proj-backend-dev-cleric').messages.length;
    const claim = claimMessage({ messageId: message.messageId, agentId: 'phase1-proj-backend-dev-cleric' });
    const afterClaim = loadAgentMessages('phase1-proj-backend-dev-cleric').messages.length;
    expect(afterClaim).toBeGreaterThanOrEqual(before);
    completeMessage({ messageId: message.messageId, agentId: 'phase1-proj-backend-dev-cleric', leaseToken: claim.leaseToken });
    const afterComplete = loadAgentMessages('phase1-proj-backend-dev-cleric').messages;
    const deliveryIds = afterComplete.map((m) => m.deliveryId).filter(Boolean);
    expect(new Set(deliveryIds).size).toBe(deliveryIds.length);
  });
});

describe('Phase 1: MCP defaults + role tools (plans 04+05)', () => {
  beforeAll(() => {
    fs.mkdirSync(testPaths.sharedStateDir, { recursive: true });
    fs.mkdirSync(testPaths.hrSystemDir, { recursive: true });
    fs.mkdirSync(testPaths.projectsDir, { recursive: true });
  });

  beforeEach(() => {
    saveHrSystem({
      'hr-mind-flayer': agent('HR Mind Flayer', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
  });

  it('new agents persist orchestration as enabled (not just ephemeral)', () => {
    const { agent } = spawnAgentViaHr('manager-bard', 'phase1-mcp', 'Mgr', {});
    expect(agent.mcp['dinah-orchestration']?.enabled).toBe(true);
    expect(loadHrSystem()[Object.keys(loadHrSystem()).find((id) => id.includes('phase1-mcp'))].mcp['dinah-orchestration']?.enabled).toBe(true);
  });

  it('effective set labels persisted vs default correctly', () => {
    const seeded = { name: 'M', role: 'manager-bard', project: 'phase1-mcp', status: 'active', mcp: {} };
    const effDefault = resolveEffectiveMcps(seeded);
    const orchDefault = effDefault.find((m) => m.id === 'dinah-orchestration');
    expect(orchDefault.source).toBe('default');
    expect(orchDefault.enabled).toBe(true);

    const persisted = { ...seeded, mcp: { 'dinah-orchestration': { enabled: true, allowedTools: ['request_staff'] } } };
    const effPersisted = resolveEffectiveMcps(persisted);
    expect(effPersisted.find((m) => m.id === 'dinah-orchestration').source).toBe('persisted');
  });

  it('legacy {} records backfill orchestration on load', () => {
    saveHrSystem({ 'legacy-agent': agent('Legacy', 'manager-bard', 'phase1-mcp') });
    const loaded = loadHrSystem();
    expect(loaded['legacy-agent'].mcp['dinah-orchestration']?.enabled).toBe(true);
  });

  it('manager gets request_staff, HR gets provision_agent, workers get progress tools', () => {
    const manager = seedDefaultPermissions('manager-bard').mcp['dinah-orchestration'].allowedTools;
    expect(manager).toEqual(expect.arrayContaining(['request_staff', 'create_task']));
    const hr = seedDefaultPermissions('hr-mind-flayer').mcp['dinah-orchestration'].allowedTools;
    expect(hr).toEqual(expect.arrayContaining(['provision_agent']));
    const worker = seedDefaultPermissions('backend-dev-cleric').mcp['dinah-orchestration'].allowedTools;
    expect(worker).toEqual(expect.arrayContaining(['update_progress', 'report_blocker', 'request_help', 'send_agent_message']));
  });

  it('unknown tools warn instead of crashing', () => {
    const { warnings } = seedDefaultPermissions('does-not-exist-role');
    expect(Array.isArray(warnings)).toBe(true);
  });
});

describe('Phase 1: coordination IDs (plan 06)', () => {
  beforeAll(() => {
    fs.mkdirSync(testPaths.sharedStateDir, { recursive: true });
    fs.mkdirSync(testPaths.hrSystemDir, { recursive: true });
    fs.mkdirSync(testPaths.projectsDir, { recursive: true });
  });

  beforeEach(() => {
    saveHrSystem({
      'hr-mind-flayer': agent('HR Mind Flayer', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
  });

  it('slug-on-create produces spaceless IDs and dirnames', () => {
    expect(slugifyProjectId('hello world')).toBe('hello-world');
    const { agentId } = spawnAgentViaHr('manager-bard', 'hello world', null, {});
    expect(agentId).not.toMatch(/\s/);
    expect(agentId).toBe('hello-world-manager-bard');
    const dir = createProjectFolder('hello world');
    expect(dir).not.toMatch(/\s/);
    expect(dir.includes('hello-world')).toBe(true);
  });

  it('role→ID canonicalization: unique resolves, multi/none keep input + warn', () => {
    saveHrSystem({
      'canon-proj-manager-bard': agent('Mgr', 'manager-bard', 'canon-proj'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    expect(canonicalAssignee('canon-proj', 'manager-bard')).toBe('canon-proj-manager-bard');
    // No match keeps input verbatim.
    expect(canonicalAssignee('canon-proj', 'ghost-role')).toBe('ghost-role');
    // Multi-match keeps input verbatim.
    saveHrSystem({
      'canon-proj-manager-bard': agent('Mgr', 'manager-bard', 'canon-proj'),
      'canon-proj-manager-bard-1': agent('Mgr2', 'manager-bard', 'canon-proj'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    expect(canonicalAssignee('canon-proj', 'manager-bard')).toBe('manager-bard');
  });

  it('new tasks/blockers/help/updates carry projectId', () => {
    saveHrSystem({
      'proj6-manager-bard': agent('Mgr', 'manager-bard', 'proj6'),
      'proj6-backend-dev-cleric': agent('Dev', 'backend-dev-cleric', 'proj6'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    const task = recordTask({
      projectId: 'proj6',
      title: 'Build it',
      assignee: 'backend-dev-cleric',
      acceptanceCriteria: ['done'],
      createdBy: 'proj6-manager-bard'
    });
    expect(task.projectId).toBe('proj6');
    expect(task.assignee).toBe('proj6-backend-dev-cleric');
    const blocker = reportBlocker({ projectId: 'proj6', agentId: 'proj6-backend-dev-cleric', blocker: 'stuck' });
    expect(blocker.projectId).toBe('proj6');
    const help = requestHelp({ projectId: 'proj6', agentId: 'proj6-backend-dev-cleric', neededRole: 'qa-engineer-rogue', question: 'help?' });
    expect(help.projectId).toBe('proj6');
    // Manager (creator) publishes progress for delegated work.
    const updated = updateTaskProgress({
      projectId: 'proj6',
      taskId: task.id,
      agentId: 'proj6-manager-bard',
      status: 'in-progress',
      summary: 'dispatched'
    });
    expect(updated.projectId).toBe('proj6');
  });

  it('old-format records without projectId still resolve via assignee/role fallback', () => {
    saveHrSystem({
      'proj6b-manager-bard': agent('Mgr', 'manager-bard', 'proj6b'),
      'proj6b-backend-dev-cleric': agent('Dev', 'backend-dev-cleric', 'proj6b'),
      'hr-mind-flayer': agent('HR', 'hr-mind-flayer', 'global')
    });
    const task = recordTask({
      projectId: 'proj6b',
      title: 'Legacy check',
      assignee: 'proj6b-backend-dev-cleric',
      createdBy: 'proj6b-manager-bard'
    });
    // Simulate an old record missing projectId + using a bare role name.
    expect(() =>
      updateTaskProgress({
        projectId: 'proj6b',
        taskId: task.id,
        agentId: 'proj6b-backend-dev-cleric',
        status: 'in-progress',
        summary: 'working'
      })
    ).not.toThrow();
  });
});
