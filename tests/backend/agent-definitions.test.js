import { describe, expect, it } from 'vitest';
import { buildAgentPrompt, loadAgentDefinition } from '../../src/backend/services/agentDefinitions.js';

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
});
