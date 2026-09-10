import { describe, expect, it } from 'vitest';
import { listAgentDefinitions } from '../../src/backend/services/agentDefinitions.js';

describe('agent role contracts', () => {
  it('keeps every shipped role definition loadable', () => {
    const definitions = listAgentDefinitions();

    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions.every((definition) => (
      typeof definition.name === 'string' &&
      typeof definition.job === 'string' &&
      typeof definition.basePrompt === 'string'
    ))).toBe(true);
  });

  it('gives the manager the coordination tools needed for orchestration', () => {
    const manager = listAgentDefinitions().find(({ name }) => name === 'manager-bard');

    expect(manager.coordination.requiredTools).toEqual(expect.arrayContaining([
      'get_project_status',
      'request_help',
      'ask_user'
    ]));
    expect(manager.coordination.managerTools).toEqual(expect.arrayContaining([
      'request_staff',
      'create_task'
    ]));
  });
});
