import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveAgentMcps } from './permissions.js';
import { issueOrchestrationToken, revokeOrchestrationToken } from '../services/orchestrationAuth.js';
import { PORT, TOOL_DIR } from '../config.js';
import { loadAgentDefinition } from '../services/agentDefinitions.js';

function orchestrationTools(agent) {
  const definition = loadAgentDefinition(agent.role);
  return [...new Set([
    ...(definition?.coordination?.requiredTools || []),
    ...(definition?.coordination?.managerTools || []),
    // Every invoked agent needs the delivery protocol to consume a wake-up.
    'list_inbox', 'claim_message', 'acknowledge_message', 'complete_message',
    'fail_message', 'release_message', 'get_message_status',
    ...(agent.role?.includes('ceo') ? ['create_project', 'ask_user'] : []),
    ...(agent.role?.includes('manager') ? ['ask_user'] : [])
  ])];
}

function resolveMcpInvocation(mcp) {
  if (mcp.id !== 'dinah-orchestration') return mcp;
  const args = [...(mcp.args || [])];
  if (args[0] && !path.isAbsolute(args[0])) {
    args[0] = path.resolve(TOOL_DIR, args[0]);
  }
  const venvCandidates = [
    process.env.DINAH_MCP_PYTHON,
    path.join(TOOL_DIR, '.venv', 'dinah-orchestration', 'bin', 'python'),
    path.join(TOOL_DIR, '..', '.venv', 'dinah-orchestration', 'bin', 'python')
  ].filter(Boolean);
  const python = venvCandidates.find((candidate) => fs.existsSync(candidate));
  return { ...mcp, command: python || mcp.command, args };
}

export function createMcpInvocationConfig(agent, agentId, projectId) {
  const mcps = resolveAgentMcps({
    ...agent,
    mcp: {
      ...(agent.mcp || {}),
      'dinah-orchestration': { enabled: true, allowedTools: orchestrationTools(agent) }
    }
  }).map(resolveMcpInvocation);
  const orchestrationToken = issueOrchestrationToken(agentId, projectId);
  const orchestrationEnv = {
    DND_BACKEND_URL: `http://127.0.0.1:${PORT}`,
    DND_AGENT_ID: agentId,
    DND_PROJECT_ID: projectId,
    DND_MCP_TOKEN: orchestrationToken
  };
  const config = {
    version: 1,
    agentId,
    projectId,
    servers: Object.fromEntries(
      mcps.map((mcp) => [
        mcp.id,
        {
          command: mcp.command,
          args: mcp.args || [],
          env: {
            ...(mcp.env || {}),
            ...(mcp.id === 'dinah-orchestration'
              ? orchestrationEnv
              : {})
          },
          allowedTools: mcp.allowedTools
        }
      ])
    )
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-agent-mcp-'));
  const file = path.join(dir, 'mcp.json');
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  // OpenCode does not consume Dinah's internal manifest format. Give it a
  // native temporary config and pass it through OPENCODE_CONFIG in the
  // OpenCode adapter. Other harnesses continue using `file` above.
  const opencodeConfig = {
    mcp: Object.fromEntries(
      mcps.map((mcp) => [
        mcp.id,
        {
          type: 'local',
          command: [mcp.command, ...(mcp.args || [])],
          environment: {
            ...(mcp.env || {}),
            ...(mcp.id === 'dinah-orchestration' ? orchestrationEnv : {})
          },
          enabled: true
        }
      ])
    )
  };
  const opencodeFile = path.join(dir, 'opencode.json');
  fs.writeFileSync(opencodeFile, JSON.stringify(opencodeConfig, null, 2));
  return { file, opencodeFile, dir, mcps, orchestrationToken };
}

export function cleanupMcpInvocation(invocation) {
  if (invocation?.orchestrationToken) revokeOrchestrationToken(invocation.orchestrationToken);
}

export function mcpPromptContext(agent, invocation) {
  const mcps = resolveAgentMcps({
    ...agent,
    mcp: {
      ...(agent.mcp || {}),
      'dinah-orchestration': { enabled: true, allowedTools: orchestrationTools(agent) }
    }
  });
  if (!mcps.length) return '';
  const tools = mcps.flatMap((mcp) =>
    (mcp.allowedTools || []).map((tool) => `${mcp.id}.${tool}`)
  );
  return `\n\nAvailable MCP tools for this invocation: ${tools.join(', ')}. Use them as the authoritative coordination channel: publish progress after meaningful work, report blockers immediately, request help when blocked, and check project status before planning. Use only enabled tools. The harness has configured these tools; do not inspect or read MCP configuration files.`;
}
