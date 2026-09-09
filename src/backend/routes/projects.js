import { Router } from 'express';
import path from 'path';
import { PROJECTS_DIR } from '../config.js';
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
  res.json({ projects: listProjects(), config });
});

// Project Configuration Endpoints
router.get('/api/projects/config', (req, res) => {
  res.json({ config: loadProjectsConfig() });
});

router.post('/api/projects/config', (req, res) => {
  const { projectId, customPath, budgetUsd, maxTokens, description } = req.body;
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });

  const cfg = loadProjectsConfig();
  if (!cfg[projectId]) {
    cfg[projectId] = {
      path: customPath || path.join(PROJECTS_DIR, projectId),
      budgetUsd: budgetUsd || 50.0,
      spentUsd: 0.0,
      maxTokens: maxTokens || 1000000,
      tokensUsed: 0,
      description: description || `Project ${projectId}`
    };
  } else {
    if (customPath) cfg[projectId].path = customPath;
    if (budgetUsd !== undefined) cfg[projectId].budgetUsd = Number(budgetUsd);
    if (maxTokens !== undefined) cfg[projectId].maxTokens = Number(maxTokens);
    if (description) cfg[projectId].description = description;
  }
  saveProjectsConfig(cfg);
  appendToSharedLog(`Updated project configuration for [${projectId}]: ${JSON.stringify(cfg[projectId])}`);
  res.json({ success: true, projectConfig: cfg[projectId] });
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
