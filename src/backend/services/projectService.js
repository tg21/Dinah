import fs from 'fs';
import path from 'path';
import { APP_DIR, PROJECTS_DIR, PROJECTS_CONFIG_FILE } from '../config.js';

export function slugifyProjectId(raw) {
  const slug = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return slug || 'project';
}

export function loadProjectsConfig() {
  if (!fs.existsSync(PROJECTS_CONFIG_FILE)) {
    const defaultConfig = {};
    fs.writeFileSync(PROJECTS_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  try {
    const data = JSON.parse(fs.readFileSync(PROJECTS_CONFIG_FILE, 'utf-8'));
    // Backfill cosmetic biome for pre-biome records (stable random per
    // project, survives restarts like every other config field).
    if (ensureBiomes(data)) {
      fs.writeFileSync(PROJECTS_CONFIG_FILE, JSON.stringify(data, null, 2));
    }
    return data;
  } catch (e) {
    return {};
  }
}

export function saveProjectsConfig(cfg) {
  fs.writeFileSync(PROJECTS_CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// Per-project backdrop biome. Cosmetic-only: picked once at creation so
// every project has a unique look, persisted in projects-config.json.
// Served to the UI via GET /api/projects (`biomes` lists valid ids).
export const PROJECT_BIOMES = ['oasis', 'grassland', 'snowy', 'urban', 'ember', 'twilight'];

export function isValidBiome(biome) {
  return PROJECT_BIOMES.includes(biome);
}

export function randomBiome() {
  return PROJECT_BIOMES[Math.floor(Math.random() * PROJECT_BIOMES.length)];
}

// Assigns a random biome to entries missing (or holding) an invalid one.
// Returns true when anything changed so callers can persist.
export function ensureBiomes(cfg) {
  let modified = false;
  for (const key of Object.keys(cfg || {})) {
    const entry = cfg[key];
    if (!entry || typeof entry !== 'object') continue;
    if (!isValidBiome(entry.biome)) {
      entry.biome = randomBiome();
      modified = true;
    }
  }
  return modified;
}

export function getProjectFolder(projectId) {
  if (!projectId || projectId === 'global') return APP_DIR;
  const cfg = loadProjectsConfig();
  // Tolerate both raw and slugged keys (write-path now always slugs).
  const slug = slugifyProjectId(projectId);
  for (const key of [projectId, slug]) {
    if (cfg[key] && cfg[key].path && fs.existsSync(cfg[key].path)) {
      return cfg[key].path;
    }
  }
  return path.join(PROJECTS_DIR, slug || 'project-alpha');
}

export function createProjectFolder(projectId, customPath = null) {
  if (!projectId || projectId === 'global') return APP_DIR;
  const slug = slugifyProjectId(projectId);
  const projectDir = customPath || path.join(PROJECTS_DIR, slug);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    const readmePath = path.join(projectDir, 'README.md');
    fs.writeFileSync(
      readmePath,
      `# Project: ${projectId}\n\nInitiated by CEO Warlock.\nManaged by Manager Bard.\nWorkspace: ${projectDir}\n`
    );
  }
  const cfg = loadProjectsConfig();
  if (!cfg[slug]) {
    cfg[slug] = {
      path: projectDir,
      budgetUsd: 50.0,
      spentUsd: 0.0,
      maxTokens: 1000000,
      tokensUsed: 0,
      description: `Project ${slug}`,
      biome: randomBiome()
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
