import fs from 'fs';
import path from 'path';
import { APP_DIR, PROJECTS_DIR, PROJECTS_CONFIG_FILE } from '../config.js';

export function loadProjectsConfig() {
  if (!fs.existsSync(PROJECTS_CONFIG_FILE)) {
    const defaultConfig = {};
    fs.writeFileSync(PROJECTS_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_CONFIG_FILE, 'utf-8'));
  } catch (e) {
    return {};
  }
}

export function saveProjectsConfig(cfg) {
  fs.writeFileSync(PROJECTS_CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export function getProjectFolder(projectId) {
  if (!projectId || projectId === 'global') return APP_DIR;
  const cfg = loadProjectsConfig();
  if (cfg[projectId] && cfg[projectId].path && fs.existsSync(cfg[projectId].path)) {
    return cfg[projectId].path;
  }
  return path.join(PROJECTS_DIR, projectId || 'project-alpha');
}

export function createProjectFolder(projectId, customPath = null) {
  if (!projectId || projectId === 'global') return APP_DIR;
  const projectDir = customPath || path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    const readmePath = path.join(projectDir, 'README.md');
    fs.writeFileSync(
      readmePath,
      `# Project: ${projectId}\n\nInitiated by CEO Warlock.\nManaged by Manager Bard.\nWorkspace: ${projectDir}\n`
    );
  }
  const cfg = loadProjectsConfig();
  if (!cfg[projectId]) {
    cfg[projectId] = {
      path: projectDir,
      budgetUsd: 50.0,
      spentUsd: 0.0,
      maxTokens: 1000000,
      tokensUsed: 0,
      description: `Project ${projectId}`
    };
    saveProjectsConfig(cfg);
  }
  return projectDir;
}

export function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  const diskProjects = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const cfg = loadProjectsConfig();
  const allProjs = Array.from(new Set([...diskProjects, ...Object.keys(cfg)]));
  return allProjs;
}
