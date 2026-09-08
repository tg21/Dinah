import { getModelById, selectBestModelForRole } from '../harness/index.js';
import { AGENT_RPG_REGISTRY } from '../data/rpgRegistry.js';
import { loadHrSystem, saveHrSystem } from './hrService.js';
import { getProjectFolder } from './projectService.js';
import {
  appendAgentMessage,
  appendAgentThought,
  appendToSharedLog
} from './messageService.js';
import { broadcastAgentEvent } from './eventBus.js';
import { sanitizeMcpPermissions } from '../mcp/index.js';
import { enqueueDirectMessage } from './messageQueueService.js';

export function calculateAgentCostEstimation(role, model, effortLevel = 'High') {
  const meta = AGENT_RPG_REGISTRY[role] || {};
  const modelObj = getModelById(model);
  const inRate = meta.costPer1kInput || 0.002;
  const outRate = meta.costPer1kOutput || 0.01;

  let multiplier = 1.0;
  if (effortLevel === 'Low') multiplier = 0.5;
  if (effortLevel === 'High') multiplier = 1.5;
  if (effortLevel === 'Extreme') multiplier = 3.0;

  const estPromptTokens = Math.round(3000 * multiplier);
  const estOutputTokens = Math.round(1500 * multiplier);
  const estCost = (estPromptTokens / 1000) * inRate + (estOutputTokens / 1000) * outRate;

  return {
    estPromptTokens,
    estOutputTokens,
    estTotalTokens: estPromptTokens + estOutputTokens,
    estCostUsd: Number(estCost.toFixed(4)),
    inputRate: inRate,
    outputRate: outRate,
    model: modelObj?.displayName || model
  };
}

export function requestAgentSummoning(role, projectId = 'project-alpha', customOptions = {}) {
  const hrSystem = loadHrSystem();
  const baseId = projectId === 'global' ? role : `${projectId}-${role}`;
  let agentId = baseId;
  let counter = 1;
  while (hrSystem[agentId]) {
    agentId = `${baseId}-${counter++}`;
  }

  const rpgStats = AGENT_RPG_REGISTRY[role] || {
    name:
      customOptions.name ||
      role
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
    role,
    class: 'Specialist Agent',
    level: 10,
    hp: 80,
    maxHp: 80,
    ac: 15,
    avatarColor: 0x95a5a6,
    stats: { STR: 12, DEX: 12, CON: 12, INT: 14, WIS: 12, CHA: 12 },
    spells: [{ name: 'Execute Directive', dice: '2d8', desc: 'Performs role task.' }],
    inventory: ['Company Keycard'],
    traits: ['Task Execution']
  };

  const selectedModel = customOptions.model
    ? getModelById(customOptions.model) || selectBestModelForRole(role, customOptions.model)
    : selectBestModelForRole(role);

  const model = selectedModel?.id || customOptions.model || 'system-simulator/balanced-agent';
  const harness = customOptions.harness || selectedModel?.source?.harness || 'opencode';
  const effortLevel = customOptions.effortLevel || rpgStats.effortLevel || 'High';
  const costEst = calculateAgentCostEstimation(role, model, effortLevel);

  const awaitingAgent = {
    name: customOptions.name || rpgStats.name,
    role,
    project: projectId,
    status: 'awaiting-confirmation',
    harness,
    model,
    effortLevel,
    promptOverride: customOptions.promptOverride || '',
    costEstimation: costEst,
    context_len: selectedModel?.contextWindow || rpgStats.contextCapacity || 128000,
    context_used: 1000,
    created_at: new Date().toISOString(),
    last_activity_ms: Date.now(),
    stats: rpgStats,
    tasks_total: 5,
    tasks_completed: 0,
    mcp: {}
  };

  hrSystem[agentId] = awaitingAgent;
  saveHrSystem(hrSystem);

  appendToSharedLog(
    `Manager requested summoning for [${awaitingAgent.name}] (${role}) in [${projectId}]. Awaiting Overseer confirmation.`
  );
  broadcastAgentEvent({
    fromAgentId: 'hr-mind-flayer',
    toAgentId: agentId,
    type: 'summon_requested',
    snippet: `Summoning requested for ${awaitingAgent.name}`
  });

  return { agentId, agent: awaitingAgent };
}

export function confirmAgentSummoning(agentId, updatedParams = {}) {
  const hrSystem = loadHrSystem();
  const agent = hrSystem[agentId];
  if (!agent) {
    throw new Error(`Agent [${agentId}] not found in registry`);
  }

  // Apply any final tweaks from confirmation dialog
  if (updatedParams.name) agent.name = updatedParams.name;
  if (updatedParams.model) {
    agent.model = updatedParams.model;
    const modelCap = getModelById(updatedParams.model);
    if (modelCap) {
      agent.harness = modelCap.source.harness;
      agent.context_len = modelCap.contextWindow || agent.context_len;
    }
  }
  if (updatedParams.harness) agent.harness = updatedParams.harness;
  if (updatedParams.effortLevel) agent.effortLevel = updatedParams.effortLevel;
  if (updatedParams.stats) agent.stats = { ...agent.stats, ...updatedParams.stats };
  if (updatedParams.mcp !== undefined) agent.mcp = sanitizeMcpPermissions(updatedParams.mcp);

  agent.status = 'active';
  agent.costEstimation = calculateAgentCostEstimation(agent.role, agent.model, agent.effortLevel);
  saveHrSystem(hrSystem);

  appendAgentMessage(agentId, {
    from: 'hr-mind-flayer',
    project: agent.project,
    request: `Summoning confirmed! Agent ${agent.name} materialized into ${agent.project} via ${agent.model}.`,
    path: getProjectFolder(agent.project),
    role: 'system'
  });

  appendAgentThought(agentId, 'SUMMONED', `Materialized into arena by Overseer confirmation.`);
  appendToSharedLog(`✨ HR Mind Flayer materialized agent [${agentId}] into [${agent.project}]!`);

  broadcastAgentEvent({
    fromAgentId: 'hr-mind-flayer',
    toAgentId: agentId,
    type: 'summon_confirmed',
    snippet: `${agent.name} materialized into arena`
  });

  return { agentId, agent };
}

export function spawnAgentViaHr(role, projectId = 'global', customName = null, options = {}) {
  const hrSystem = loadHrSystem();
  const baseId = projectId === 'global' ? role : `${projectId}-${role}`;
  let agentId = baseId;
  let counter = 1;
  while (hrSystem[agentId]) {
    agentId = `${baseId}-${counter++}`;
  }

  const rpgStats = AGENT_RPG_REGISTRY[role] || {
    name:
      customName ||
      role
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
    role,
    class: 'Specialist Agent',
    level: 10,
    hp: 80,
    maxHp: 80,
    ac: 15,
    avatarColor: 0x95a5a6,
    stats: { STR: 12, DEX: 12, CON: 12, INT: 14, WIS: 12, CHA: 12 },
    spells: [{ name: 'Execute Directive', dice: '2d8', desc: 'Performs role task.' }],
    inventory: ['Standard Issue Notebook', 'Access Keycard'],
    traits: ['Task Execution']
  };

  const selectedModel = options.model
    ? getModelById(options.model) || selectBestModelForRole(role, options.model)
    : selectBestModelForRole(role);

  const model = selectedModel?.id || options.model || 'system-simulator/balanced-agent';
  const harness = options.harness || selectedModel?.source?.harness || 'opencode';
  const effortLevel = options.effortLevel || rpgStats.effortLevel || 'High';

  const newAgent = {
    name: customName || rpgStats.name,
    role,
    project: projectId,
    status: 'active',
    harness,
    model,
    effortLevel,
    promptOverride: options.promptOverride || '',
    context_len: selectedModel?.contextWindow || rpgStats.contextCapacity || 128000,
    context_used: 1500,
    created_at: new Date().toISOString(),
    last_activity_ms: Date.now(),
    stats: rpgStats,
    tasks_total: 5,
    tasks_completed: 0,
    mcp: {}
  };

  hrSystem[agentId] = newAgent;
  saveHrSystem(hrSystem);

  appendAgentMessage(agentId, {
    from: 'hr-mind-flayer',
    project: projectId,
    request: `Agent ${newAgent.name} successfully spawned and assigned to ${projectId}. System prompt initialized from template.`,
    path: getProjectFolder(projectId),
    role: 'system'
  });

  appendAgentThought(agentId, 'INITIALIZE', `Spawned into project ${projectId} by HR Mind Flayer.`);
  appendToSharedLog(`HR Mind Flayer spawned agent [${agentId}] for project [${projectId}]`);

  return { agentId, agent: newAgent };
}

// Project creation is idempotent: a project always has exactly one default manager.
export function ensureProjectManager(projectId, options = {}) {
  const hrSystem = loadHrSystem();
  const existing = Object.entries(hrSystem).find(([, agent]) =>
    agent.project === projectId && agent.role === 'manager-bard' && agent.status !== 'retired'
  );
  if (existing) return { agentId: existing[0], agent: existing[1], created: false };
  return { ...spawnAgentViaHr('manager-bard', projectId, options.name || `Manager Bard (${projectId})`, options), created: true };
}

export function sendProjectBriefToManager(projectId, managerAgentId, brief, fromAgentId = 'ceo-warlock') {
  if (!brief || !String(brief).trim()) return null;
  return enqueueDirectMessage({
    fromAgentId,
    toAgentId: managerAgentId,
    projectId,
    message: `Project brief from CEO for ${projectId}:\n\n${String(brief).trim()}`
  });
}
