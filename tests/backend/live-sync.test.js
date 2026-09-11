import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated workspace so live-sync tests never touch the real working-area.
const testPaths = vi.hoisted(() => {
  const workingDir = '/tmp/dnd-live-sync-vitest';
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
  addSseClient,
  broadcastAgentEvent,
  clearAgentEventQueue,
  getAgentEventQueue,
  removeSseClient
} from '../../src/backend/services/eventBus.js';
import { saveHrSystem } from '../../src/backend/services/hrService.js';
import {
  confirmAgentSummoning,
  requestAgentSummoning,
  spawnAgentViaHr
} from '../../src/backend/services/agentLifecycle.js';
import systemRoutes from '../../src/backend/routes/system.js';

function agent(name, role, project = 'sync-proj', status = 'active') {
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

function mockSseRes(impl) {
  return { write: impl || vi.fn() };
}

describe('Live roster sync: SSE fan-out + roster event contract', () => {
  beforeAll(() => {
    resetWorkspace();
  });

  afterAll(() => {
    fs.rmSync(testPaths.workingDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetWorkspace();
    saveHrSystem({
      'sync-proj-manager-bard': agent('Manager', 'manager-bard', 'sync-proj'),
      'hr-mind-flayer': agent('HR Mind Flayer', 'hr-mind-flayer', 'global')
    });
    clearAgentEventQueue();
  });

  it('broadcast reaches SSE clients and stays in the poll queue', () => {
    const res = mockSseRes(vi.fn());
    addSseClient(res);
    try {
      const evt = broadcastAgentEvent({ type: 'summon_requested', toAgentId: 'x' });
      expect(res.write).toHaveBeenCalledOnce();
      expect(String(res.write.mock.calls[0][0])).toContain(evt.id);
      expect(getAgentEventQueue().some((e) => e.id === evt.id)).toBe(true);
    } finally {
      removeSseClient(res);
    }
  });

  it('dead SSE clients are dropped instead of breaking broadcast', () => {
    const dead = mockSseRes(() => {
      throw new Error('closed');
    });
    const live = mockSseRes(vi.fn());
    addSseClient(dead);
    addSseClient(live);
    try {
      expect(() => broadcastAgentEvent({ type: 'agent_updated' })).not.toThrow();
      expect(live.write).toHaveBeenCalledOnce();
      // Dead client removed: second broadcast only hits the live one.
      broadcastAgentEvent({ type: 'agent_updated' });
      expect(live.write).toHaveBeenCalledTimes(2);
    } finally {
      removeSseClient(dead);
      removeSseClient(live);
    }
  });

  it('request/confirm/spawn emit the roster event types the UI subscribes to', () => {
    const { agentId: awaitingId } = requestAgentSummoning('backend-dev-cleric', 'sync-proj', {
      requesterId: 'sync-proj-manager-bard'
    });
    const requested = getAgentEventQueue().find((e) => e.type === 'summon_requested');
    expect(requested?.toAgentId).toBe(awaitingId);

    confirmAgentSummoning(awaitingId, {});
    const confirmed = getAgentEventQueue().find((e) => e.type === 'summon_confirmed');
    expect(confirmed?.toAgentId).toBe(awaitingId);

    const { agentId: spawnedId } = spawnAgentViaHr('qa-engineer-rogue', 'sync-proj', 'QA Rogue', {});
    const spawned = getAgentEventQueue().find((e) => e.type === 'agent_spawned');
    expect(spawned?.toAgentId).toBe(spawnedId);
  });

  it('system router exposes the SSE stream alongside the poll endpoint', () => {
    const paths = (systemRoutes.stack || [])
      .map((layer) => layer?.route?.path)
      .filter(Boolean);
    expect(paths).toContain('/api/events');
    expect(paths).toContain('/api/events/stream');
  });
});
