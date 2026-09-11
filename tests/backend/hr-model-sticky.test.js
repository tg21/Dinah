import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const testPaths = vi.hoisted(() => {
  const workingDir = '/tmp/dnd-hr-sticky-vitest';
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
  MCP_CATALOG_URL: 'x',
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

import { loadHrSystem } from '../../src/backend/services/hrService.js';
import { setRegistry } from '../../src/backend/harness/store.js';

const OPENCODE_MODEL = {
  id: 'opencode/muse-spark-1.3',
  source: { harness: 'opencode' },
  capabilities: { tools: true, thinking: true },
  contextWindow: 200000
};
const AGY_MODEL = {
  id: 'antigravity/gemini-3.1-pro-high',
  source: { harness: 'antigravity' },
  capabilities: { tools: true, thinking: true },
  contextWindow: 1000000
};

function resetWorkspace() {
  fs.rmSync(testPaths.workingDir, { recursive: true, force: true });
  fs.mkdirSync(testPaths.sharedStateDir, { recursive: true });
  fs.mkdirSync(testPaths.hrSystemDir, { recursive: true });
  fs.mkdirSync(testPaths.projectsDir, { recursive: true });
}

function writeHr(agents) {
  fs.writeFileSync(testPaths.hrSystemFile, JSON.stringify(agents, null, 2));
}

function pinnedManager() {
  return {
    name: 'Manager',
    role: 'manager-bard',
    project: 'proj',
    status: 'active',
    harness: 'opencode',
    model: 'opencode/muse-spark-1.3',
    effortLevel: 'High',
    context_len: 200000,
    context_used: 1000,
    last_activity_ms: Date.now(),
    mcp: {}
  };
}

describe('HR model reconciliation keeps explicit configuration', () => {
  beforeAll(() => resetWorkspace());
  afterAll(() => fs.rmSync(testPaths.workingDir, { recursive: true, force: true }));
  beforeEach(() => {
    resetWorkspace();
    setRegistry(
      [{ id: 'opencode', name: 'OpenCode' }, { id: 'antigravity', name: 'Antigravity' }],
      [OPENCODE_MODEL, AGY_MODEL]
    );
  });

  it('explicit model+harness survive even when the model is undiscovered', () => {
    // Detection skew: only the agy model is visible this boot.
    setRegistry([{ id: 'antigravity', name: 'Antigravity' }], [AGY_MODEL]);
    writeHr({ 'proj-manager-bard': pinnedManager() });
    const loaded = loadHrSystem();
    expect(loaded['proj-manager-bard'].model).toBe('opencode/muse-spark-1.3');
    expect(loaded['proj-manager-bard'].harness).toBe('opencode');
    // Persisted record keeps the explicit pair (MCP backfill may add defaults).
    const persisted = JSON.parse(fs.readFileSync(testPaths.hrSystemFile, 'utf8'))['proj-manager-bard'];
    expect(persisted.model).toBe('opencode/muse-spark-1.3');
    expect(persisted.harness).toBe('opencode');
  });

  it('missing model still gets a best pick', () => {
    const mgr = pinnedManager();
    delete mgr.model;
    writeHr({ 'proj-manager-bard': mgr });
    const loaded = loadHrSystem();
    expect(loaded['proj-manager-bard'].model).toBeTruthy();
    expect(loaded['proj-manager-bard'].harness).toBeTruthy();
  });

  it('discovered model with mismatched harness is aligned', () => {
    const mgr = pinnedManager();
    mgr.harness = 'antigravity'; // stale field, model says opencode
    writeHr({ 'proj-manager-bard': mgr });
    const loaded = loadHrSystem();
    expect(loaded['proj-manager-bard'].model).toBe('opencode/muse-spark-1.3');
    expect(loaded['proj-manager-bard'].harness).toBe('opencode');
  });
});
