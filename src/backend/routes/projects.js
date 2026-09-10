import { Router } from 'express';
import {
  createProjectFolder,
  listProjects,
  loadProjectsConfig,
  saveProjectsConfig
} from '../services/projectService.js';
import { appendToSharedLog } from '../services/messageService.js';
import { ensureProjectManager, sendProjectBriefToManager } from '../services/agentLifecycle.js';

const router = Router();

// Get all projects
router.get('/api/projects', (req, res) => {
  const projects = listProjects();
  const config = loadProjectsConfig();
  res.json({ projects, config });
});

// Project Configuration Endpoints
router.get('/api/projects/config', (req, res) => {
  res.json({ config: loadProjectsConfig() });
});

router.post('/api/projects/config', (req, res) => {
  const { projectId, customPath, budgetUsd, maxTokens, description } = req.body;
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });

  const cfg = loadProjectsConfig();
  const isNew = !cfg[projectId];
  if (isNew) {
    // A config entry is a project: create the folder and guarantee its manager
    // so this path cannot leave a manager-less project behind.
    createProjectFolder(projectId, customPath || null);
    const fresh = loadProjectsConfig();
    // createProjectFolder already seeded defaults; apply caller overrides.
    if (customPath) fresh[projectId].path = customPath;
    if (budgetUsd !== undefined) fresh[projectId].budgetUsd = Number(budgetUsd);
    if (maxTokens !== undefined) fresh[projectId].maxTokens = Number(maxTokens);
    if (description) fresh[projectId].description = description;
    saveProjectsConfig(fresh);
    Object.assign(cfg, fresh);
  } else {
    if (customPath) cfg[projectId].path = customPath;
    if (budgetUsd !== undefined) cfg[projectId].budgetUsd = Number(budgetUsd);
    if (maxTokens !== undefined) cfg[projectId].maxTokens = Number(maxTokens);
    if (description) cfg[projectId].description = description;
    saveProjectsConfig(cfg);
  }
  const manager = ensureProjectManager(projectId);
  if (isNew && description) sendProjectBriefToManager(projectId, manager.agentId, description);
  appendToSharedLog(`Updated project configuration for [${projectId}]: ${JSON.stringify(cfg[projectId])}`);
  res.json({ success: true, projectConfig: cfg[projectId], managerAgentId: manager.agentId, managerCreated: manager.created });
});

// Start new project
router.post('/handleStartProject', (req, res) => {
  const { projectId, customPath, budgetUsd, description = '' } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  createProjectFolder(projectId, customPath);
  if (budgetUsd) {
    const cfg = loadProjectsConfig();
    if (cfg[projectId]) cfg[projectId].budgetUsd = Number(budgetUsd);
    saveProjectsConfig(cfg);
  }

  appendToSharedLog(`CEO Warlock initiated new project: [${projectId}]`);
  const manager = ensureProjectManager(projectId);
  sendProjectBriefToManager(projectId, manager.agentId, description);

  return res.json({
    success: true,
    projectId,
    managerAgentId: manager.agentId,
    managerCreated: manager.created,
    message: `Project ${projectId} created. HR Mind Flayer ${manager.created ? 'spawned' : 'found'} ${manager.agentId}.`
  });
});

export default router;
