import { loadMcpRegistry } from './registry.js';
import { loadAgentDefinition } from '../services/agentDefinitions.js';

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

// ------------------------------------------------------------
// Plans 04+05: default MCP seeding from role templates
// ------------------------------------------------------------

export function buildToolToServerMap(registry = loadMcpRegistry()) {
  const map = new Map();
  const ambiguous = new Set();
  for (const mcp of registry) {
    for (const tool of mcp.tools || []) {
      if (!tool?.name) continue;
      if (map.has(tool.name) && map.get(tool.name) !== mcp.id) {
        ambiguous.add(tool.name);
        // Prefer shipped dinah-orchestration on conflict (locked decision).
        if (mcp.id !== 'dinah-orchestration') continue;
      }
      map.set(tool.name, mcp.id);
    }
  }
  return { map, ambiguous: [...ambiguous] };
}

/**
 * Baseline worker coordination tools. Unknown/generic roles (e.g. manager-shorthand
 * `frontend-dev`, `code-reviewer`) have no template, but still need to read fresh
 * project state, publish progress, and message the manager. Read-all + write-own:
 * `update_progress` is auth-scoped to assignee/creator, so this cannot hijack
 * others' work. Manager-only tools (`request_staff`, `create_task`,
 * `provision_agent`) are deliberately excluded here.
 */
export const DEFAULT_WORKER_TOOLS = [
  'get_project_status',
  'update_progress',
  'report_blocker',
  'request_help',
  'send_agent_message'
];

/**
 * Build default MCP permissions for a role from its template
 * `coordination.requiredTools + coordination.managerTools`.
 * Tools owned by non-orchestration servers enable those servers;
 * unknown tools are returned as warnings (never a crash).
 * Unknown roles fall back to DEFAULT_WORKER_TOOLS so ad-hoc specialists
 * can still coordinate (read fresh state, publish own progress).
 */
export function seedDefaultPermissions(role) {
  const definition = loadAgentDefinition(role);
  const required = definition?.coordination?.requiredTools || [];
  const manager = definition?.coordination?.managerTools || [];
  let wanted = [...new Set([...required, ...manager])];
  const warnings = [];
  if (!wanted.length && role) {
    wanted = [...DEFAULT_WORKER_TOOLS];
    warnings.push(`No template for role [${role}]; fell back to baseline worker tools`);
  }
  const { map, ambiguous } = buildToolToServerMap();
  for (const tool of ambiguous) {
    if (wanted.includes(tool)) warnings.push(`Ambiguous tool [${tool}] resolved to dinah-orchestration`);
  }

  const byServer = new Map();
  const orchestrationTools = [];
  for (const tool of wanted) {
    const owner = map.get(tool);
    if (!owner) {
      warnings.push(`No MCP server owns tool [${tool}] for role [${role}]`);
      // Still include it on the orchestration entry so the intent is visible;
      // invocation sanitization keeps this safe.
      orchestrationTools.push(tool);
      continue;
    }
    if (owner === 'dinah-orchestration') {
      orchestrationTools.push(tool);
    } else {
      if (!byServer.has(owner)) byServer.set(owner, new Set());
      byServer.get(owner).add(tool);
    }
  }

  const mcp = {};
  const registry = loadMcpRegistry();
  if (orchestrationTools.length || role) {
    // Orchestration is always a default (plan 04); tool list is role-derived (plan 05).
    const orch = registry.find((m) => m.id === 'dinah-orchestration');
    const known = new Set((orch?.tools || []).map((t) => t.name));
    mcp['dinah-orchestration'] = {
      enabled: true,
      allowedTools: orchestrationTools.filter((t) => known.size === 0 || known.has(t) || true)
    };
    // Ensure the delivery protocol is always present in defaults so wakes work,
    // even for roles whose templates omit it.
    for (const t of ['list_inbox', 'claim_message', 'acknowledge_message', 'complete_message', 'fail_message', 'release_message', 'get_message_status']) {
      if (!mcp['dinah-orchestration'].allowedTools.includes(t) && (!known.size || known.has(t))) {
        mcp['dinah-orchestration'].allowedTools.push(t);
      }
    }
  }
  for (const [serverId, tools] of byServer) {
    mcp[serverId] = { enabled: true, allowedTools: [...tools] };
  }
  return { mcp, warnings };
}

/**
 * Merge seeded defaults into an agent record without clobbering explicit
 * persisted entries. Explicit `enabled:false` always wins (except the
 * mandatory invocation-time orchestration injection, which stays in
 * `mcp/invocation.js` as a safety net).
 * Returns { applied:boolean, warnings }.
 */
export function ensureAgentMcpDefaults(agent) {
  if (!agent || typeof agent !== 'object') return { applied: false, warnings: [] };
  const { mcp: defaults, warnings } = seedDefaultPermissions(agent.role);
  if (!agent.mcp || typeof agent.mcp !== 'object') agent.mcp = {};
  let applied = false;
  for (const [id, perm] of Object.entries(defaults)) {
    if (!agent.mcp[id]) {
      agent.mcp[id] = perm;
      applied = true;
    } else if (agent.mcp[id].enabled !== false && Array.isArray(perm.allowedTools)) {
      const merged = new Set([...(agent.mcp[id].allowedTools || []), ...perm.allowedTools]);
      if (merged.size !== (agent.mcp[id].allowedTools || []).length) {
        agent.mcp[id] = { ...agent.mcp[id], allowedTools: [...merged] };
        applied = true;
      }
    }
  }
  return { applied, warnings };
}

/**
 * Effective MCP set for the UI: persisted entries labelled `persisted`,
 * seeded fallbacks labelled `default`. Never mutates the agent.
 */
export function resolveEffectiveMcps(agent) {
  const registry = loadMcpRegistry();
  const persisted = (agent?.mcp && typeof agent.mcp === 'object') ? agent.mcp : {};
  const { mcp: defaults } = seedDefaultPermissions(agent?.role || '');
  return registry.map((mcp) => {
    if (persisted[mcp.id] && typeof persisted[mcp.id] === 'object') {
      return {
        ...mcp,
        enabled: persisted[mcp.id].enabled === true,
        allowedTools: Array.isArray(persisted[mcp.id].allowedTools)
          ? persisted[mcp.id].allowedTools
          : (mcp.tools || []).map((t) => t.name),
        source: 'persisted'
      };
    }
    if (defaults[mcp.id]) {
      return { ...mcp, enabled: true, allowedTools: defaults[mcp.id].allowedTools || [], source: 'default' };
    }
    return { ...mcp, enabled: false, allowedTools: [], source: 'default' };
  });
}
