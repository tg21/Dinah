import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveAgentMcps } from './permissions.js';

export function createMcpInvocationConfig(agent, agentId, projectId) {
  const mcps = resolveAgentMcps(agent);
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
          env: mcp.env || {},
          allowedTools: mcp.allowedTools
        }
      ])
    )
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-agent-mcp-'));
  const file = path.join(dir, 'mcp.json');
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return { file, dir, mcps };
}

export function mcpPromptContext(agent, invocation) {
  const mcps = resolveAgentMcps(agent);
  if (!mcps.length) return '';
  const tools = mcps.flatMap((mcp) =>
    (mcp.allowedTools || []).map((tool) => `${mcp.id}.${tool}`)
  );
  return `\n\nAvailable MCP tools for this invocation: ${tools.join(', ')}. Use only the enabled tools. MCP manifest: ${invocation.file}.`;
}
