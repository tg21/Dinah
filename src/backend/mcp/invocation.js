import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveAgentMcps } from './permissions.js';
import { issueOrchestrationToken, revokeOrchestrationToken } from '../services/orchestrationAuth.js';
import { PORT } from '../config.js';
import { loadAgentDefinition } from '../services/agentDefinitions.js';

function orchestrationTools(agent) {
  const definition = loadAgentDefinition(agent.role);
  return [...new Set([
    ...(definition?.coordination?.requiredTools || []),
    ...(definition?.coordination?.managerTools || [])
  ])];
}

export function createMcpInvocationConfig(agent, agentId, projectId) {
  const mcps = resolveAgentMcps({
    ...agent,
    mcp: {
      ...(agent.mcp || {}),
      'dinah-orchestration': { enabled: true, allowedTools: orchestrationTools(agent) }
    }
  });
  const orchestrationToken = issueOrchestrationToken(agentId, projectId);
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
              ? {
                  DND_BACKEND_URL: `http://127.0.0.1:${PORT}`,
                  DND_AGENT_ID: agentId,
                  DND_PROJECT_ID: projectId,
                  DND_MCP_TOKEN: orchestrationToken
                }
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
  return { file, dir, mcps, orchestrationToken };
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
  return `\n\nAvailable MCP tools for this invocation: ${tools.join(', ')}. Use them as the authoritative coordination channel: publish progress after meaningful work, report blockers immediately, request help when blocked, and check project status before planning. Use only enabled tools. MCP manifest: ${invocation.file}.`;
}
