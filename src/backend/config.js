import fs from 'fs';
import path from 'path';

export const PORT = process.env.PORT || 2121;
export const APP_DIR = process.cwd();

export const HR_SYSTEM_DIR = path.join(APP_DIR, 'hr-system');
export const AGENT_TEMPLATES_DIR = path.join(APP_DIR, 'agent-templates');
export const PROMPTS_DIR = path.join(APP_DIR, 'prompts');
export const SHARED_STATE_DIR = path.join(APP_DIR, 'shared-state');
export const PROJECTS_DIR = path.join(APP_DIR, 'projects');
export const MCP_DIR = path.join(APP_DIR, 'mcp');
export const MCP_SERVERS_DIR = path.join(MCP_DIR, 'servers');
export const MCP_REGISTRY_FILE = path.join(MCP_DIR, 'registry.json');
export const MCP_CATALOG_URL =
  process.env.MCP_REGISTRY_URL || 'https://registry.modelcontextprotocol.io';
export const PROJECTS_CONFIG_FILE = path.join(PROJECTS_DIR, 'projects-config.json');
export const KNOWLEDGE_BASE_FILE = path.join(SHARED_STATE_DIR, 'knowledge-base.json');
export const MARSHALL_AUDIT_FILE = path.join(SHARED_STATE_DIR, 'marshall-audit.json');
export const STARTUP_SETUP_FILE = path.join(SHARED_STATE_DIR, 'startup-setup.json');
export const STARTUP_SELECTION_AUDIT_FILE = path.join(
  SHARED_STATE_DIR,
  'startup-model-selection.json'
);
export const HR_SYSTEM_FILE = path.join(HR_SYSTEM_DIR, 'hr-system.json');

// React frontend (Vite). `npm run build:frontend` emits to dist/frontend;
// the dev tree also keeps src/frontend/dist for local runs without a full build.
export const FRONTEND_DIST_DIR = path.join(APP_DIR, 'dist', 'frontend');
export const FRONTEND_DEV_DIST_DIR = path.join(APP_DIR, 'src', 'frontend', 'dist');

export function resolveFrontendDistDir() {
  if (fs.existsSync(path.join(FRONTEND_DIST_DIR, 'index.html'))) return FRONTEND_DIST_DIR;
  if (fs.existsSync(path.join(FRONTEND_DEV_DIST_DIR, 'index.html')))
    return FRONTEND_DEV_DIST_DIR;
  return null;
}

export const TOP_LEVEL_AGENT_IDS = [
  'hr-mind-flayer',
  'staff-engineer-paladin',
  'senior-analyst-diviner',
  'marshall-agent-system-inspector'
];

export function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ensureBaseDirs() {
  ensureDirExists(HR_SYSTEM_DIR);
  ensureDirExists(AGENT_TEMPLATES_DIR);
  ensureDirExists(PROMPTS_DIR);
  ensureDirExists(SHARED_STATE_DIR);
  ensureDirExists(PROJECTS_DIR);
  ensureDirExists(MCP_DIR);
  ensureDirExists(MCP_SERVERS_DIR);
}
