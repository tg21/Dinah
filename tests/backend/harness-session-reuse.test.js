import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testPaths = vi.hoisted(() => {
  const workingDir = '/tmp/dnd-session-reuse-vitest';
  const toolDir = process.cwd();
  return {
    workingDir,
    toolDir,
    sharedStateDir: `${workingDir}/shared-state`,
    hrSystemDir: `${workingDir}/hr-system`,
    projectsDir: `${workingDir}/projects`,
    hrSystemFile: `${workingDir}/hr-system/hr-system.json`,
    projectsConfigFile: `${workingDir}/projects/projects-config.json`
  };
});

vi.mock('../../src/backend/config.js', () => ({
  APP_DIR: testPaths.workingDir,
  AGENT_TEMPLATES_DIR: path.join(testPaths.toolDir, 'agent-templates'),
  HR_SYSTEM_DIR: testPaths.hrSystemDir,
  HR_SYSTEM_FILE: testPaths.hrSystemFile,
  PROJECTS_DIR: testPaths.projectsDir,
  PROJECTS_CONFIG_FILE: testPaths.projectsConfigFile,
  SHARED_STATE_DIR: testPaths.sharedStateDir,
  SHIPPED_MCP_DIR: path.join(testPaths.toolDir, 'mcp'),
  SHIPPED_MCP_SERVERS_DIR: path.join(testPaths.toolDir, 'mcp', 'servers'),
  SHIPPED_MCP_REGISTRY_FILE: path.join(testPaths.toolDir, 'mcp', 'registry.json'),
  USER_MCP_DIR: path.join(testPaths.workingDir, 'user-mcps'),
  USER_MCP_SERVERS_DIR: path.join(testPaths.workingDir, 'user-mcps', 'servers'),
  USER_MCP_REGISTRY_FILE: path.join(testPaths.workingDir, 'user-mcps', 'registry.json'),
  MCP_CATALOG_URL: 'x',
  TOOL_DIR: testPaths.toolDir,
  PORT: 2121,
  TOP_LEVEL_AGENT_IDS: [],
  STARTUP_SETUP_FILE: path.join(testPaths.sharedStateDir, 'startup-setup.json'),
  STARTUP_SELECTION_AUDIT_FILE: path.join(testPaths.sharedStateDir, 'startup-model-selection.json'),
  PROMPTS_DIR: path.join(testPaths.toolDir, 'prompts'),
  MARSHALL_AUDIT_FILE: path.join(testPaths.sharedStateDir, 'marshall-audit.json'),
  KNOWLEDGE_BASE_FILE: path.join(testPaths.sharedStateDir, 'knowledge-base.json'),
  DINAH_MARKER_FILE: path.join(testPaths.workingDir, '.dinah'),
  WORKING_DIR: testPaths.workingDir,
  USING_DEFAULT_WORKING_AREA: false,
  ensureBaseDirs: () => {},
  resolveFrontendDistDir: () => null,
  getTaskDedupeWindowMs: () => 900000,
  DEFAULT_TASK_DEDUPE_WINDOW_MS: 900000
}));

import { buildContinuationPrompt } from '../../src/backend/services/agentDefinitions.js';
import {
  clearAllHarnessSessions,
  clearHarnessSession,
  getStoredSessionId,
  parseAgyJsonOutput,
  parseClaudeJsonOutput,
  parseCopilotJsonOutput,
  persistHarnessSession,
  sessionKeyForHarness
} from '../../src/backend/services/harnessRunner.js';
import { loadHrSystem, saveHrSystem } from '../../src/backend/services/hrService.js';

function seedAgent(agentId, extra = {}) {
  saveHrSystem({
    [agentId]: {
      name: 'Test Agent',
      role: 'backend-dev-cleric',
      project: 'demo-proj',
      status: 'active',
      harness: 'opencode',
      model: 'opencode/test-model',
      ...extra
    }
  });
}

beforeEach(() => {
  fs.rmSync(testPaths.workingDir, { recursive: true, force: true });
  fs.mkdirSync(testPaths.hrSystemDir, { recursive: true });
  fs.mkdirSync(testPaths.sharedStateDir, { recursive: true });
  fs.mkdirSync(testPaths.projectsDir, { recursive: true });
});

describe('harness session reuse', () => {
  it('maps harness names to stable session keys', () => {
    expect(sessionKeyForHarness('opencode')).toBe('opencode');
    expect(sessionKeyForHarness('codex')).toBe('codex');
    expect(sessionKeyForHarness('agy')).toBe('agy');
    expect(sessionKeyForHarness('antigravity')).toBe('agy');
    expect(sessionKeyForHarness('claude-code')).toBe('claude-code');
    expect(sessionKeyForHarness('claude')).toBe('claude-code');
    expect(sessionKeyForHarness('copilot')).toBe('copilot');
    expect(sessionKeyForHarness('gemini')).toBeNull();
    expect(sessionKeyForHarness('ollama')).toBeNull();
  });

  it('persists session ids on the HR record so reuse survives restarts', () => {
    seedAgent('demo-proj-backend-dev-cleric');
    persistHarnessSession('demo-proj-backend-dev-cleric', 'opencode', 'ses_abc123');
    persistHarnessSession('demo-proj-backend-dev-cleric', 'agy', 'conv-1');
    // Simulate a server restart: re-read from disk.
    const reloaded = loadHrSystem();
    expect(reloaded['demo-proj-backend-dev-cleric'].harnessSessions).toMatchObject({
      opencode: 'ses_abc123',
      agy: 'conv-1'
    });
    expect(getStoredSessionId('demo-proj-backend-dev-cleric', 'opencode')).toBe('ses_abc123');
    expect(getStoredSessionId('demo-proj-backend-dev-cleric', 'antigravity')).toBe('conv-1');
  });

  it('clears sessions per-harness and on provider switches', () => {
    seedAgent('demo-proj-backend-dev-cleric', {
      harnessSessions: { opencode: 'ses_1', codex: 'thread_1', agy: 'conv_1' }
    });
    clearHarnessSession('demo-proj-backend-dev-cleric', 'opencode');
    expect(getStoredSessionId('demo-proj-backend-dev-cleric', 'opencode')).toBeNull();
    expect(getStoredSessionId('demo-proj-backend-dev-cleric', 'codex')).toBe('thread_1');
    clearAllHarnessSessions('demo-proj-backend-dev-cleric');
    expect(loadHrSystem()['demo-proj-backend-dev-cleric'].harnessSessions).toBeUndefined();
  });

  it('parses the agy --output-format json envelope', () => {
    const stdout = JSON.stringify({
      conversation_id: '3a287a80-aa76-425a-9f39-7d1c750352b2',
      status: 'SUCCESS',
      response: 'HELLO_PROBE\n',
      duration_seconds: 1.35,
      num_turns: 1
    });
    const parsed = parseAgyJsonOutput(stdout);
    expect(parsed.sessionId).toBe('3a287a80-aa76-425a-9f39-7d1c750352b2');
    expect(parsed.output).toBe('HELLO_PROBE');
  });

  it('parses agy output pasted after a stale-conversation warning line', () => {
    const stdout = [
      'warning: conversation "does-not-exist-123" not found',
      JSON.stringify({ conversation_id: 'new-conv-id', status: 'SUCCESS', response: 'Hello!\n' })
    ].join('\n');
    const parsed = parseAgyJsonOutput(stdout);
    expect(parsed.sessionId).toBe('new-conv-id');
    expect(parsed.output).toBe('Hello!');
  });

  it('agy parser falls back to raw stdout for non-JSON output', () => {
    const parsed = parseAgyJsonOutput('plain agy output');
    expect(parsed.output).toBe('plain agy output');
    expect(parsed.sessionId).toBeNull();
  });

  it('parses the claude --output-format json result envelope', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: '76e72018-1aad-40e4-b580-c8998223cc88',
      result: 'Hello from Claude\n'
    });
    const parsed = parseClaudeJsonOutput(stdout);
    expect(parsed.sessionId).toBe('76e72018-1aad-40e4-b580-c8998223cc88');
    expect(parsed.output).toBe('Hello from Claude');
    expect(parsed.isError).toBe(false);
  });

  it('flags claude api errors so the turn falls back instead of consuming', () => {
    const stdout = JSON.stringify({
      type: 'result',
      is_error: true,
      session_id: '76e72018-1aad-40e4-b580-c8998223cc88',
      result: 'Credit balance is too low'
    });
    const parsed = parseClaudeJsonOutput(stdout);
    expect(parsed.isError).toBe(true);
    expect(parsed.sessionId).toBe('76e72018-1aad-40e4-b580-c8998223cc88');
    expect(parsed.output).toBe('Credit balance is too low');
  });

  it('claude parser falls back to raw stdout for non-JSON output', () => {
    const parsed = parseClaudeJsonOutput('plain claude output');
    expect(parsed.output).toBe('plain claude output');
    expect(parsed.sessionId).toBeNull();
    expect(parsed.isError).toBe(false);
  });

  it('parses copilot --output-format json JSONL (final message + result sessionId)', () => {
    const stdout = [
      JSON.stringify({ type: 'assistant.message_delta', data: { messageId: 'm1', deltaContent: 'PLUTO' } }),
      JSON.stringify({ type: 'assistant.message_delta', data: { messageId: 'm1', deltaContent: '77' } }),
      JSON.stringify({ type: 'assistant.message', data: { messageId: 'm1', content: 'PLUTO77', phase: 'final_answer' } }),
      JSON.stringify({ type: 'result', timestamp: '2026-09-12T19:57:58.333Z', sessionId: 'd73910a1-cb74-4e4f-a927-eb5247a43c77', exitCode: 0 })
    ].join('\n');
    const parsed = parseCopilotJsonOutput(stdout);
    expect(parsed.sessionId).toBe('d73910a1-cb74-4e4f-a927-eb5247a43c77');
    expect(parsed.output).toBe('PLUTO77');
  });

  it('copilot parser joins deltas when no final message is present', () => {
    const stdout = [
      JSON.stringify({ type: 'assistant.message_delta', data: { messageId: 'm1', deltaContent: 'Hi' } }),
      JSON.stringify({ type: 'assistant.message_delta', data: { messageId: 'm1', deltaContent: '! How can I help?' } }),
      JSON.stringify({ type: 'result', sessionId: 'sess-2', exitCode: 0 })
    ].join('\n');
    const parsed = parseCopilotJsonOutput(stdout);
    expect(parsed.sessionId).toBe('sess-2');
    expect(parsed.output).toBe('Hi! How can I help?');
  });

  it('copilot parser falls back to raw stdout for non-JSON output', () => {
    const parsed = parseCopilotJsonOutput('plain copilot output');
    expect(parsed.output).toBe('plain copilot output');
    expect(parsed.sessionId).toBeNull();
  });

  it('continuation prompts carry identity + task without re-injecting the full bootstrap', () => {
    const prompt = buildContinuationPrompt('Do the follow-up thing.', {
      role: 'manager-bard',
      name: 'Manager Bard',
      project: 'demo-proj',
      effortLevel: 'High',
      promptOverride: 'Focus on QA.'
    });
    expect(prompt).toContain('Continuing as manager-bard');
    expect(prompt).toContain('Do the follow-up thing.');
    expect(prompt).toContain('Focus on QA.');
    expect(prompt).not.toContain('Runtime context:');
    expect(prompt).not.toContain('Staffable roles');
  });
});
