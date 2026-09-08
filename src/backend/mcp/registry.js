import fs from 'fs';
import path from 'path';
import {
  SHIPPED_MCP_REGISTRY_FILE,
  SHIPPED_MCP_SERVERS_DIR,
  USER_MCP_DIR,
  USER_MCP_REGISTRY_FILE
} from '../config.js';

function readRegistry(file, source) {
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const entries = Array.isArray(data) ? data : data.mcps || [];
    return entries.map((mcp) => {
      const result = { ...mcp, sourceType: source };
      // Older shipped registries contained a machine-specific --prefix path.
      if (source === 'shipped' && Array.isArray(result.args)) {
        const prefixIndex = result.args.indexOf('--prefix');
        if (prefixIndex >= 0 && result.args[prefixIndex + 1]) {
          result.args = [...result.args];
          result.args[prefixIndex + 1] = path.join(
            SHIPPED_MCP_SERVERS_DIR,
            path.basename(result.args[prefixIndex + 1])
          );
        }
      }
      return result;
    });
  } catch (error) {
    console.error(`Unable to read ${source} MCP registry:`, error.message);
    return [];
  }
}

export function loadMcpRegistry() {
  const all = [
    ...readRegistry(SHIPPED_MCP_REGISTRY_FILE, 'shipped'),
    ...readRegistry(USER_MCP_REGISTRY_FILE, 'user')
  ];
  // A user-managed MCP may intentionally replace a shipped entry with the
  // same id, so the user copy is the effective one.
  return [...new Map(all.map((mcp) => [mcp.id, mcp])).values()];
}

export function loadUserMcpRegistry() {
  return readRegistry(USER_MCP_REGISTRY_FILE, 'user');
}

export function saveMcpRegistry(mcps) {
  if (!fs.existsSync(USER_MCP_DIR)) fs.mkdirSync(USER_MCP_DIR, { recursive: true });
  fs.writeFileSync(
    USER_MCP_REGISTRY_FILE,
    JSON.stringify({ mcps: mcps.map(({ sourceType, ...mcp }) => mcp) }, null, 2)
  );
}
