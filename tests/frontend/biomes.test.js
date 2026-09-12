import { describe, expect, it, vi } from 'vitest';

const testPaths = vi.hoisted(() => ({
  workingDir: '/tmp/dnd-biomes-vitest',
  projectsDir: '/tmp/dnd-biomes-vitest/projects',
  projectsConfigFile: '/tmp/dnd-biomes-vitest/projects/projects-config.json'
}));

vi.mock('../../src/backend/config.js', () => ({
  APP_DIR: testPaths.workingDir,
  PROJECTS_DIR: testPaths.projectsDir,
  PROJECTS_CONFIG_FILE: testPaths.projectsConfigFile
}));

import { PROJECT_BIOMES } from '../../src/backend/services/projectService.js';
import {
  BACKDROPS,
  BIOME_META,
  OBJECT_SETS,
  backdropFor,
  biomeLabel,
  objectsFor
} from '../../src/frontend/src/components/PlayArea/layers/biomes.js';
import { WORLD_PARTS } from '../../src/frontend/src/components/PlayArea/layers/WorldObjectsLayer.jsx';

describe('project biome roster', () => {
  it('uses one shared id set across backend, meta, backdrops, and object sets', () => {
    const backend = [...PROJECT_BIOMES].sort();
    const meta = BIOME_META.map((b) => b.id).sort();
    expect(meta).toEqual(backend);
    expect(Object.keys(BACKDROPS).sort()).toEqual(backend);
    expect(Object.keys(OBJECT_SETS).sort()).toEqual(backend);
  });

  it('falls back to oasis for unknown biomes', () => {
    expect(backdropFor('atlantis')).toBe(BACKDROPS.oasis);
    expect(objectsFor('atlantis')).toBe(OBJECT_SETS.oasis);
    expect(biomeLabel('atlantis')).toBe('Oasis Meadow');
  });

  it('gives every biome a valid, in-bounds artefact set', () => {
    for (const [biome, objects] of Object.entries(OBJECT_SETS)) {
      expect(objects.length, biome).toBeGreaterThan(0);
      for (const o of objects) {
        expect(WORLD_PARTS, `${biome}:${o.p}`).toContain(o.p);
        expect(o.fx, `${biome}:${o.p} fx`).toBeGreaterThanOrEqual(0);
        expect(o.fx, `${biome}:${o.p} fx`).toBeLessThanOrEqual(1);
        expect(o.fy, `${biome}:${o.p} fy`).toBeGreaterThanOrEqual(0);
        expect(o.fy, `${biome}:${o.p} fy`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('varies artefact placement and count between biomes', () => {
    const fingerprints = Object.values(OBJECT_SETS).map((objects) =>
      JSON.stringify(objects.map((o) => [o.p, o.fx, o.fy]))
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    const counts = new Set(Object.values(OBJECT_SETS).map((o) => o.length));
    expect(counts.size).toBeGreaterThan(1);
  });
});
