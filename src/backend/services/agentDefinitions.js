import fs from 'fs';
import path from 'path';
import { AGENT_TEMPLATES_DIR, APP_DIR, PORT, TOOL_DIR } from '../config.js';

const REQUIRED_FIELDS = ['name', 'job', 'basePrompt'];

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
  const runtime = [
    `Role: ${role}`,
    `Job: ${definition?.job || 'Specialist agent'}`,
    `Model policy: ${JSON.stringify(definition?.modelPolicy || {})}`,
    `Runtime customization: ${JSON.stringify(definition?.runtimeCustomization || {})}`,
    agent.promptOverride ? `Active specialization override: ${agent.promptOverride}` : null,
    `Coordination protocol: ${definition?.coordination?.operatingRule || 'Publish progress, report blockers, and request help through the available coordination tools.'}`,
    `Workspace: ${options.workspaceDir || (agent.project === 'global' ? APP_DIR : path.join(APP_DIR, 'projects', agent.project || 'global'))}`,
    options.includeToolRoot === false ? null : `Tool root: ${TOOL_DIR}`,
    `Backend port: ${PORT}`,
    'Use the workspace and enabled MCP tools as the source of truth. Do not invent endpoints, credentials, paths, or completed work.',
    'When an action requires orchestration, return a structured request describing the action and arguments; do not issue arbitrary HTTP requests.'
  ].filter(Boolean).join('\n');
  return `${basePrompt}\n\nRuntime context:\n${runtime}\n\nTask:\n${task}`;
}

export function listAgentDefinitions() {
  if (!fs.existsSync(AGENT_TEMPLATES_DIR)) return [];
  return fs.readdirSync(AGENT_TEMPLATES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => loadAgentDefinition(path.basename(file, '.json')))
    .filter(Boolean);
}
