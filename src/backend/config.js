import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const PORT = process.env.PORT || 2121;
// The tool root is derived from this module, while the working directory is
// deliberately derived from where the user launched the server.
export const TOOL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const LAUNCH_DIR = path.resolve(process.cwd());
export const USING_DEFAULT_WORKING_AREA = LAUNCH_DIR === TOOL_DIR;
export const WORKING_DIR = USING_DEFAULT_WORKING_AREA
  ? path.join(TOOL_DIR, 'working-area')
  : LAUNCH_DIR;
export const DINAH_MARKER_FILE = path.join(WORKING_DIR, '.dinah');
// Compatibility name for services that mean "the user's active workspace".
export const APP_DIR = WORKING_DIR;

export const HR_SYSTEM_DIR = path.join(WORKING_DIR, 'hr-system');
export const AGENT_TEMPLATES_DIR = path.join(TOOL_DIR, 'agent-templates');
export const PROMPTS_DIR = path.join(TOOL_DIR, 'prompts');
export const SHARED_STATE_DIR = path.join(WORKING_DIR, 'shared-state');
export const PROJECTS_DIR = path.join(WORKING_DIR, 'projects');
export const SHIPPED_MCP_DIR = path.join(TOOL_DIR, 'mcp');
export const SHIPPED_MCP_SERVERS_DIR = path.join(SHIPPED_MCP_DIR, 'servers');
export const SHIPPED_MCP_REGISTRY_FILE = path.join(SHIPPED_MCP_DIR, 'registry.json');
export const USER_MCP_DIR = path.join(WORKING_DIR, 'user-mcps');
export const USER_MCP_SERVERS_DIR = path.join(USER_MCP_DIR, 'servers');
export const USER_MCP_REGISTRY_FILE = path.join(USER_MCP_DIR, 'registry.json');
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
export const FRONTEND_DIST_DIR = path.join(TOOL_DIR, 'dist', 'frontend');
export const FRONTEND_DEV_DIST_DIR = path.join(TOOL_DIR, 'src', 'frontend', 'dist');

function initialiseMarker() {
  const defaults = {
    system: 'dinah',
    version: 1,
    initializedAt: new Date().toISOString(),
    toolRoot: TOOL_DIR,
    workingDirectory: WORKING_DIR,
    runtime: { backendPort: Number(PORT) }
  };
  if (!fs.existsSync(DINAH_MARKER_FILE)) {
    fs.writeFileSync(DINAH_MARKER_FILE, JSON.stringify(defaults, null, 2));
    return;
  }
  try {
    const marker = JSON.parse(fs.readFileSync(DINAH_MARKER_FILE, 'utf8'));
    if (!marker.runtime?.backendPort) {
      fs.writeFileSync(
        DINAH_MARKER_FILE,
        JSON.stringify({ ...defaults, ...marker, runtime: { ...defaults.runtime, ...marker.runtime } }, null, 2)
      );
    }
  } catch (error) {
    console.warn(`Unable to read ${DINAH_MARKER_FILE}:`, error.message);
  }
}

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
  ensureDirExists(WORKING_DIR);
  initialiseMarker();
  ensureDirExists(HR_SYSTEM_DIR);
  ensureDirExists(SHARED_STATE_DIR);
  ensureDirExists(PROJECTS_DIR);
  ensureDirExists(USER_MCP_DIR);
  ensureDirExists(USER_MCP_SERVERS_DIR);
}
