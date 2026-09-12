import fs from 'fs';
import path from 'path';
import { AGENT_TEMPLATES_DIR, APP_DIR, PORT, TOOL_DIR } from '../config.js';

const REQUIRED_FIELDS = ['name', 'job', 'basePrompt'];

// Optional cosmetic sprite block in agent-templates/<role>.json:
// { hat, tool, ears }. Unknown values are ignored (frontend falls back),
// so sprite edits can never break staffing validation or prompts.
const SPRITE_VALUES = {
  hat: ['crown', 'tentacles', 'helm', 'hood', 'visor', 'feather', 'pointed', 'halo', 'glow', 'horns', 'cap', 'beret', 'goggles', 'spectacles', 'beads', 'wreath', 'mask', 'mitre', 'skull', 'cape', 'none'],
  tool: ['scepter', 'orb', 'sword', 'badge', 'lute', 'staff', 'hammer', 'daggers', 'bow', 'wrench', 'scroll', 'quill', 'flask', 'chalice', 'scythe', 'axe', 'brush'],
  ears: ['round', 'pointy', 'fins', 'none']
};

export function sanitizeSprite(sprite) {
  if (!sprite || typeof sprite !== 'object') return null;
  const clean = {};
  for (const key of Object.keys(SPRITE_VALUES)) {
    clean[key] = SPRITE_VALUES[key].includes(sprite[key]) ? sprite[key] : null;
  }
  if (!clean.hat && !clean.tool && !clean.ears) return null;
  return clean;
}

// Role → sanitized sprite map for the UI. Roles without a usable sprite
// block are omitted; the frontend falls back to its default silhouette.
export function getRoleSprites() {
  const out = {};
  for (const definition of listAgentDefinitions()) {
    const sprite = sanitizeSprite(definition.sprite);
    if (sprite) out[definition.name] = sprite;
  }
  return out;
}

function definitionPath(role) {
  if (!/^[a-z0-9-]+$/.test(role)) return null;
  return path.join(AGENT_TEMPLATES_DIR, `${role}.json`);
}

export function loadAgentDefinition(role) {
  const file = definitionPath(role);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const definition = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const field of REQUIRED_FIELDS) {
      if (typeof definition[field] !== 'string' || !definition[field].trim()) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    if (definition.name !== role) throw new Error('name must match the filename');
    return definition;
  } catch (error) {
    console.error(`Unable to load agent definition for ${role}:`, error.message);
    return null;
  }
}

export function buildAgentPrompt(role, task, agent = {}, options = {}) {
  const definition = loadAgentDefinition(role);
  const basePrompt = definition?.basePrompt ||
    'Act as a careful specialist. Inspect the repository and requirements before making changes. Explain decisions, verify your work, and report blockers honestly.';
  // Staffing-capable roles get the live template roster so they request exact
  // role IDs instead of inventing shorthand (which staffing now rejects).
  const staffingTools = definition?.coordination?.managerTools || [];
  const canStaff = staffingTools.includes('request_staff') || staffingTools.includes('provision_agent');
  const staffableRoles = canStaff
    ? listAgentDefinitions().map((entry) => entry.name).sort().join(', ')
    : null;
  const runtime = [
    `Role: ${role}`,
    `Job: ${definition?.job || 'Specialist agent'}`,
    `Model policy: ${JSON.stringify(definition?.modelPolicy || {})}`,
    `Runtime customization: ${JSON.stringify(definition?.runtimeCustomization || {})}`,
    agent.effortLevel ? `Effort level: ${agent.effortLevel}` : null,
    agent.promptOverride ? `Active specialization override: ${agent.promptOverride}` : null,
    `Coordination protocol: ${definition?.coordination?.operatingRule || 'Publish progress, report blockers, and request help through the available coordination tools.'}`,
    staffableRoles ? `Staffable roles (request_staff/provision_agent accept ONLY these exact IDs): ${staffableRoles}` : null,
    `Workspace: ${options.workspaceDir || (agent.project === 'global' ? APP_DIR : path.join(APP_DIR, 'projects', agent.project || 'global'))}`,
    options.includeToolRoot === false ? null : `Tool root: ${TOOL_DIR}`,
    `Backend port: ${PORT}`,
    'Use the workspace and enabled MCP tools as the source of truth. Do not invent endpoints, credentials, paths, or completed work.',
    'When an action requires orchestration, return a structured request describing the action and arguments; do not issue arbitrary HTTP requests.'
  ].filter(Boolean).join('\n');
  return `${basePrompt}\n\nRuntime context:\n${runtime}\n\nTask:\n${task}`;
}

// Continuation prompt for resumed harness sessions (plan 01 session reuse).
// A resumed native session already holds the full base prompt, staffable
// roster, and workspace context from its first turn, so re-injecting the
// whole bootstrap on every follow-up only bloats context and risks
// confusing the model with duplicate system instructions. Continuations send
// just identity + the new task; the caller appends the fresh per-turn MCP
// context (token-scoped manifest path) separately.
export function buildContinuationPrompt(task, agent = {}, options = {}) {
  const header = [
    `Continuing as ${agent.role || 'specialist'} (${agent.name || 'agent'}) in ${agent.project || options.project || 'global'}.`,
    agent.effortLevel ? `Effort level: ${agent.effortLevel}` : null,
    agent.promptOverride ? `Active specialization override: ${agent.promptOverride}` : null
  ].filter(Boolean).join(' ');
  return `${header}\n\nTask:\n${task}`;
}

export function listAgentDefinitions() {
  if (!fs.existsSync(AGENT_TEMPLATES_DIR)) return [];
  return fs.readdirSync(AGENT_TEMPLATES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => loadAgentDefinition(path.basename(file, '.json')))
    .filter(Boolean);
}
