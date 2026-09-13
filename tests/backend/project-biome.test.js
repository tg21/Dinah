import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated workspace so these tests never touch the real working-area.
const testPaths = vi.hoisted(() => {
  const workingDir = '/tmp/dnd-project-biome-vitest';
  return {
    workingDir,
    projectsDir: `${workingDir}/projects`,
    projectsConfigFile: `${workingDir}/projects/projects-config.json`
  };
});
const { workingDir, projectsDir, projectsConfigFile } = testPaths;

vi.mock('../../src/backend/config.js', () => ({
  APP_DIR: testPaths.workingDir,
  PROJECTS_DIR: testPaths.projectsDir,
  PROJECTS_CONFIG_FILE: testPaths.projectsConfigFile
}));

import {
  createProjectFolder,
  ensureBiomes,
  isValidBiome,
  loadProjectsConfig,
  PROJECT_BIOMES,
  randomBiome,
  saveProjectsConfig
} from '../../src/backend/services/projectService.js';

beforeEach(() => {
  fs.rmSync(workingDir, { recursive: true, force: true });
  fs.mkdirSync(projectsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(workingDir, { recursive: true, force: true });
});

describe('project backdrop biomes', () => {
  it('ships a fixed roster of valid biomes', () => {
    expect(PROJECT_BIOMES).toContain('oasis');
    for (const id of ['grassland', 'snowy', 'urban', 'ember', 'twilight']) {
      expect(PROJECT_BIOMES).toContain(id);
    }
    expect(isValidBiome(randomBiome())).toBe(true);
    expect(isValidBiome('volcano')).toBe(false);
    expect(isValidBiome(undefined)).toBe(false);
  });

  it('assigns a valid biome when a project is created', () => {
    createProjectFolder('biome-alpha');
    const cfg = loadProjectsConfig();
    expect(isValidBiome(cfg['biome-alpha']?.biome)).toBe(true);
  });

  it('backfills legacy entries missing a biome and persists it', () => {
    saveProjectsConfig({
      'legacy-proj': { path: path.join(projectsDir, 'legacy-proj'), budgetUsd: 50 }
    });
    const cfg = loadProjectsConfig();
    expect(isValidBiome(cfg['legacy-proj'].biome)).toBe(true);
    // Survives a "restart": a fresh load keeps the assigned biome.
    const again = loadProjectsConfig();
    expect(again['legacy-proj'].biome).toBe(cfg['legacy-proj'].biome);
  });

  it('replaces invalid biomes but never touches the rest of the record', () => {
    const cfg = {
      'odd-proj': { path: path.join(projectsDir, 'odd-proj'), budgetUsd: 42, biome: 'atlantis' }
    };
    expect(ensureBiomes(cfg)).toBe(true);
    expect(isValidBiome(cfg['odd-proj'].biome)).toBe(true);
    expect(cfg['odd-proj'].budgetUsd).toBe(42);
  });
});
