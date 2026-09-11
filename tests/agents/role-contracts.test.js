import { describe, expect, it } from 'vitest';
import { listAgentDefinitions } from '../../src/backend/services/agentDefinitions.js';
import { seedDefaultPermissions } from '../../src/backend/mcp/permissions.js';

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

  it('seeds manager/HR/worker tool sets into default MCP permissions', () => {
    const managerTools = seedDefaultPermissions('manager-bard').mcp['dinah-orchestration'].allowedTools;
    expect(managerTools).toEqual(expect.arrayContaining(['request_staff', 'create_task']));

    const hrTools = seedDefaultPermissions('hr-mind-flayer').mcp['dinah-orchestration'].allowedTools;
    expect(hrTools).toEqual(expect.arrayContaining(['provision_agent']));

    const workerTools = seedDefaultPermissions('backend-dev-cleric').mcp['dinah-orchestration'].allowedTools;
    expect(workerTools).toEqual(expect.arrayContaining([
      'update_progress',
      'report_blocker',
      'request_help',
      'send_agent_message'
    ]));
  });

  it('falls back to baseline worker tools for unknown/generic roles', () => {
    for (const role of ['frontend-dev', 'code-reviewer', 'qa-engineer', 'does-not-exist-role']) {
      const tools = seedDefaultPermissions(role).mcp['dinah-orchestration'].allowedTools;
      expect(tools).toEqual(expect.arrayContaining([
        'get_project_status',
        'update_progress',
        'report_blocker',
        'request_help',
        'send_agent_message',
        'list_inbox',
        'claim_message',
        'complete_message'
      ]));
      // Baseline must not grant manager-only powers.
      expect(tools).not.toContain('request_staff');
      expect(tools).not.toContain('create_task');
      expect(tools).not.toContain('provision_agent');
    }
  });

  it('gives every shipped template the baseline worker coordination tools', () => {
    for (const definition of listAgentDefinitions()) {
      expect(definition.coordination?.requiredTools || []).toEqual(expect.arrayContaining([
        'get_project_status',
        'update_progress',
        'report_blocker',
        'request_help',
        'send_agent_message'
      ]));
    }
  });
});
