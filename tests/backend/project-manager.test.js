import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Isolated workspace so these tests never touch the real working-area.
const testPaths = vi.hoisted(() => {
  const workingDir = '/tmp/dnd-project-manager-vitest';
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

import { ensureProjectManager } from '../../src/backend/services/agentLifecycle.js';
import { loadHrSystem } from '../../src/backend/services/hrService.js';
import { createProjectFolder, loadProjectsConfig } from '../../src/backend/services/projectService.js';
import { resolveProjectDir } from '../../src/backend/services/harnessRunner.js';

describe('project manager auto-spawn', () => {
  beforeAll(() => {
    fs.mkdirSync(testPaths.sharedStateDir, { recursive: true });
    fs.mkdirSync(testPaths.hrSystemDir, { recursive: true });
    fs.mkdirSync(testPaths.projectsDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(testPaths.workingDir, { recursive: true, force: true });
  });

  it('spawns a manager-bard when a project is created', () => {
    const projectId = 'proj-manager-spawn';

    // Mirrors the /handleStartProject and POST /api/projects/config flows:
    // folder first, then the idempotent manager guarantee.
    createProjectFolder(projectId);
    const manager = ensureProjectManager(projectId);

    expect(manager.created).toBe(true);
    expect(manager.agentId).toBe(`${projectId}-manager-bard`);
    expect(manager.agent.role).toBe('manager-bard');
    expect(manager.agent.status).toBe('active');
    expect(loadHrSystem()[manager.agentId]).toBeDefined();
  });

  it('is idempotent: a second guarantee finds the existing manager', () => {
    const projectId = 'proj-manager-idempotent';

    createProjectFolder(projectId);
    const first = ensureProjectManager(projectId);
    const second = ensureProjectManager(projectId);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.agentId).toBe(first.agentId);
    const managers = Object.entries(loadHrSystem()).filter(
      ([, agent]) => agent.project === projectId && agent.role === 'manager-bard'
    );
    expect(managers).toHaveLength(1);
  });

  it('repairs manager-less projects created by folder/config writes alone', () => {
    const projectId = 'proj-manager-repair';

    // Simulate a project that exists on disk/config but never got a manager
    // (the pre-fix POST /api/projects/config gap).
    createProjectFolder(projectId);
    expect(loadProjectsConfig()[projectId]).toBeDefined();
    const before = Object.values(loadHrSystem()).filter(
      (agent) => agent.project === projectId && agent.role === 'manager-bard'
    );
    expect(before).toHaveLength(0);

    const manager = ensureProjectManager(projectId);
    expect(manager.created).toBe(true);
    expect(loadHrSystem()[manager.agentId].role).toBe('manager-bard');
  });

  it('guarantees a manager when harness dispatch implicitly creates a project', () => {
    const projectId = 'proj-manager-implicit';

    // resolveProjectDir is what every harness adapter calls: a dispatch to a
    // brand-new projectId must not leave that project manager-less.
    const dir = resolveProjectDir(projectId);
    expect(fs.existsSync(dir)).toBe(true);

    const managers = Object.entries(loadHrSystem()).filter(
      ([, agent]) => agent.project === projectId && agent.role === 'manager-bard'
    );
    expect(managers).toHaveLength(1);
    expect(managers[0][1].status).toBe('active');
  });
});
