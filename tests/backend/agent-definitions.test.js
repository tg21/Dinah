import { describe, expect, it } from 'vitest';
import { buildAgentPrompt, getRoleSprites, loadAgentDefinition, sanitizeSprite } from '../../src/backend/services/agentDefinitions.js';

describe('agent definitions', () => {
  it('loads the manager role with coordination metadata', () => {
    const definition = loadAgentDefinition('manager-bard');

    expect(definition).toMatchObject({
      name: 'manager-bard',
      job: expect.any(String),
      basePrompt: expect.any(String),
      coordination: expect.objectContaining({ operatingRule: expect.any(String) })
    });
  });

  it('rejects unsafe or missing role definitions', () => {
    expect(loadAgentDefinition('../manager-bard')).toBeNull();
    expect(loadAgentDefinition('does-not-exist')).toBeNull();
  });

  it('preserves the core role and adds runtime specialization', () => {
    const prompt = buildAgentPrompt('manager-bard', 'Coordinate the release.', {
      project: 'demo-project',
      promptOverride: 'Focus on accessibility acceptance criteria.'
    });

    expect(prompt).toContain('Project Manager and Router');
    expect(prompt).toContain('Active specialization override: Focus on accessibility acceptance criteria.');
    expect(prompt).toContain('Task:\nCoordinate the release.');
  });

  it('lists exact staffable template IDs for staffing-capable roles only', () => {    const managerPrompt = buildAgentPrompt('manager-bard', 'Staff the sprint.', { project: 'demo-project' });
    expect(managerPrompt).toContain('Staffable roles');
    expect(managerPrompt).toContain('code-reviewer-justicar');
    expect(managerPrompt).toContain('tech-writer-scribe');

    const workerPrompt = buildAgentPrompt('backend-dev-cleric', 'Build the API.', { project: 'demo-project' });
    expect(workerPrompt).not.toContain('Staffable roles');
  });

  it('loads the cosmetic sprite block without affecting prompts', () => {
    const definition = loadAgentDefinition('manager-bard');
    expect(definition.sprite).toEqual({ hat: 'feather', tool: 'lute', ears: 'pointy' });
    expect(buildAgentPrompt('manager-bard', 'Hi.', { project: 'demo' })).not.toContain('feather');
  });

  it('sanitizes sprite blocks tolerantly (never throws, never breaks staffing)', () => {
    expect(sanitizeSprite(null)).toBeNull();
    expect(sanitizeSprite('crown')).toBeNull();
    expect(sanitizeSprite({})).toBeNull();
    expect(sanitizeSprite({ hat: 'crown', tool: 'laser-gun', ears: 'round' })).toEqual({
      hat: 'crown',
      tool: null,
      ears: 'round'
    });
  });

  it('exposes a sprite entry for every shipped template', () => {
    const roles = getRoleSprites();
    expect(Object.keys(roles).length).toBeGreaterThanOrEqual(26);
    expect(roles['solution-architect-wizard']).toEqual({ hat: 'pointed', tool: 'staff', ears: 'round' });
    expect(roles['hr-mind-flayer']).toEqual({ hat: 'tentacles', tool: 'orb', ears: 'none' });
  });
});
