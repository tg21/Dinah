import fs from 'fs';
import { MCP_REGISTRY_FILE } from '../config.js';

export function loadMcpRegistry() {
  if (!fs.existsSync(MCP_REGISTRY_FILE)) {
    fs.writeFileSync(MCP_REGISTRY_FILE, JSON.stringify({ mcps: [] }, null, 2));
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(MCP_REGISTRY_FILE, 'utf-8'));
    return Array.isArray(data) ? data : data.mcps || [];
  } catch (e) {
    console.error('Unable to read MCP registry:', e.message);
    return [];
  }
}

export function saveMcpRegistry(mcps) {
  fs.writeFileSync(MCP_REGISTRY_FILE, JSON.stringify({ mcps }, null, 2));
}
