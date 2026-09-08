import { loadMcpRegistry } from './registry.js';

export function normaliseAgentMcpPermissions(agent) {
  if (!agent.mcp) agent.mcp = {};
  return agent.mcp;
}

export function resolveAgentMcps(agent) {
  const permissions = normaliseAgentMcpPermissions(agent);
  return loadMcpRegistry()
    .filter((mcp) => permissions[mcp.id]?.enabled !== false && permissions[mcp.id]?.enabled === true)
    .map((mcp) => ({
      ...mcp,
      allowedTools: permissions[mcp.id]?.allowedTools || mcp.tools?.map((tool) => tool.name) || []
    }));
}

export function sanitizeMcpPermissions(value) {
  const registry = loadMcpRegistry();
  const input = value && typeof value === 'object' ? value : {};
  const allowedIds = new Set(registry.map((mcp) => mcp.id));
  const result = {};
  for (const [id, permission] of Object.entries(input)) {
    if (!allowedIds.has(id) || !permission || typeof permission !== 'object') continue;
    const mcp = registry.find((item) => item.id === id);
    const knownTools = new Set((mcp.tools || []).map((tool) => tool.name));
    result[id] = {
      enabled: permission.enabled === true,
      allowedTools: Array.isArray(permission.allowedTools)
        ? permission.allowedTools.filter((tool) => knownTools.has(tool))
        : [...knownTools]
    };
  }
  return result;
}
