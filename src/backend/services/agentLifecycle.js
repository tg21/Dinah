import { getModelById, selectBestModelForRole } from '../harness/index.js';
import { AGENT_RPG_REGISTRY } from '../data/rpgRegistry.js';
import { loadHrSystem, saveHrSystem } from './hrService.js';
import { getProjectFolder, slugifyProjectId } from './projectService.js';
import {
  appendAgentMessage,
  appendAgentThought,
  appendToSharedLog
} from './messageService.js';
import { broadcastAgentEvent } from './eventBus.js';
import { sanitizeMcpPermissions, seedDefaultPermissions } from '../mcp/index.js';
import { loadAgentDefinition, listAgentDefinitions } from './agentDefinitions.js';
import { enqueueDirectMessage } from './messageQueueService.js';
import { getProjectCoordination } from './coordinationService.js';

// Appearance is cosmetic-only: a soft-palette index + variant persisted on
// the HR record so each agent looks unique and survives restarts. A
// recreated agent gets a fresh look. Frontend resolves legacy records
// without this field via a stable hash fallback.
const APPEARANCE_PALETTE_COUNT = 8;
export function randomAppearance() {
  return {
    paletteId: Math.floor(Math.random() * APPEARANCE_PALETTE_COUNT),
    variant: Math.floor(Math.random() * 3)
  };
}

// Plan 07: post-spawn wake. New agents start with an empty inbox, so the 5s
// dispatcher (messageDispatcher.js, queued-inbox only) never wakes them even
// when tasks sit `assigned`. Seed one inbox item — first assigned task, or a
// check-in nudge when nothing is assigned — and let the dispatcher wake the
// agent within seconds. Best-effort: seeding must never break spawn/confirm.
function findAssignedTask(projectId, agentId, role) {
  try {
    const coord = getProjectCoordination(projectId);
    const tasks = coord?.tasks || [];
    const exact = tasks.filter((t) => t.assignee === agentId && t.status === 'assigned');
    if (exact.length) return exact[0];
    // Legacy bare-role records (pre-plan-06): treat a role-name assignment as
    // this agent's when roles match.
    const roleMatch = tasks.filter((t) => t.assignee === role && t.status === 'assigned');
    if (roleMatch.length) return roleMatch[0];
    return null;
  } catch {
    return null;
  }
}

function seedPostSpawnInbox(agentId, agent, hrSystem) {
  const task = findAssignedTask(agent.project, agentId, agent.role);
  try {
    if (task) {
      const sender = task.createdBy && hrSystem[task.createdBy] ? task.createdBy : 'hr-mind-flayer';
      const desc = task.description ? `\n\n${task.description}` : '';
      const ac =
        Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length
          ? `\n\nAcceptance criteria:\n${task.acceptanceCriteria.join('\n')}`
          : '';
      enqueueDirectMessage({
        fromAgentId: sender,
        toAgentId: agentId,
        projectId: agent.project,
        message: `Task assignment [${task.id}] for [${agentId}]: ${task.title}${desc}${ac}`
      });
    } else {
      enqueueDirectMessage({
        fromAgentId: 'hr-mind-flayer',
        toAgentId: agentId,
        projectId: agent.project,
        message: `No assigned tasks yet for [${agentId}] — check in with your manager for ${agent.project} via list_inbox / get_project_status.`
      });
    }
  } catch {
    /* seed is best-effort; dispatcher wake must never break spawn */
  }
  try {
    appendAgentThought(
      agentId,
      'SPAWN_WAKE',
      task ? `Inbox seeded with task ${task.id}; dispatcher will wake within seconds.` : 'Inbox seeded with check-in nudge (no assigned tasks).'
    );
  } catch {
    /* thoughts must never break spawn */
  }
}

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

// Staffing is template-only: every provisioned agent must match an
// `agent-templates/<role>.json` definition. Unknown roles used to spawn
// silently degraded agents (generic prompt, inbox-only tools, no progress
// reporting). Fail closed with the valid list so the requester retries with
// a real template name instead of homebrewing one.
export function assertKnownRole(role) {
  if (typeof role === 'string' && loadAgentDefinition(role)) return role;
  const valid = listAgentDefinitions().map((definition) => definition.name).sort();
  throw new Error(
    `Unknown role [${role}]. Staffing accepts only agent-template names. Valid roles: ${valid.join(', ')}`
  );
}

export function requestAgentSummoning(role, projectId = 'project-alpha', customOptions = {}) {
  assertKnownRole(role);
  const hrSystem = loadHrSystem();
  const cleanProjectId = projectId === 'global' ? 'global' : slugifyProjectId(projectId);
  const baseId = cleanProjectId === 'global' ? role : `${cleanProjectId}-${role}`;
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
    project: cleanProjectId,
    status: 'awaiting-confirmation',
    appearance: customOptions.appearance || randomAppearance(),
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
    mcp: seedDefaultPermissions(role).mcp
  };

  hrSystem[agentId] = awaitingAgent;
  saveHrSystem(hrSystem);

  const requesterId = customOptions.requesterId || customOptions.createdBy || 'manager-bard';
  const staffingText =
    `Staffing request from [${requesterId}] for [${awaitingAgent.name}] (${role}) in [${cleanProjectId}]. ` +
    `Model=${model} Harness=${harness} Effort=${effortLevel}` +
    (customOptions.promptOverride ? ` Specialization: ${String(customOptions.promptOverride).slice(0, 300)}` : '') +
    ` Awaiting Overseer confirmation for [${agentId}].`;
  // Generic path: a durable DM from requester → HR. The queue projects into
  // BOTH drawers, emits the courier event, and shows in message-activity, so
  // no staffing-specific logging helper is needed. HR's harness turn consumes
  // this inbox item; whatever HR then does is visible the same way.
  // Best-effort: staffing must never fail just because the queue write did.
  try {
    enqueueDirectMessage({
      fromAgentId: requesterId,
      toAgentId: 'hr-mind-flayer',
      projectId: cleanProjectId,
      message: staffingText
    });
  } catch {
    appendToSharedLog(staffingText);
  }
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
  const providerChanged = Boolean(updatedParams.model || updatedParams.harness);
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
  // Backfill seeded defaults for legacy awaiting records (plans 04+05).
  if (!agent.mcp || typeof agent.mcp !== 'object' || !agent.mcp['dinah-orchestration']) {
    const { mcp: defaults } = seedDefaultPermissions(agent.role);
    agent.mcp = { ...defaults, ...(agent.mcp || {}) };
    if (!agent.mcp['dinah-orchestration']) agent.mcp['dinah-orchestration'] = defaults['dinah-orchestration'];
  }

  agent.status = 'active';
  agent.costEstimation = calculateAgentCostEstimation(agent.role, agent.model, agent.effortLevel);
  // Awaiting records have no harness turns yet, but a confirm-time
  // provider/model switch must still not inherit a stale session id.
  if (providerChanged && agent.harnessSessions) delete agent.harnessSessions;
  saveHrSystem(hrSystem);

  // Generic path: durable HR → agent confirmation. Queue projection handles
  // both drawers + courier event; no HR-specific audit helper.
  appendAgentThought(agentId, 'SUMMONED', `Materialized into arena by Overseer confirmation.`);
  try {
    enqueueDirectMessage({
      fromAgentId: 'hr-mind-flayer',
      toAgentId: agentId,
      projectId: agent.project,
      message: `Summoning confirmed! Agent ${agent.name} materialized into ${agent.project} via ${agent.model}/${agent.harness} effort=${agent.effortLevel}.`
    });
  } catch {
    appendAgentMessage(agentId, {
      from: 'hr-mind-flayer',
      project: agent.project,
      request: `Summoning confirmed! Agent ${agent.name} materialized into ${agent.project} via ${agent.model}.`,
      path: getProjectFolder(agent.project),
      role: 'system'
    });
    appendToSharedLog(`HR Mind Flayer materialized agent [${agentId}] into [${agent.project}]!`);
  }

  broadcastAgentEvent({
    fromAgentId: 'hr-mind-flayer',
    toAgentId: agentId,
    type: 'summon_confirmed',
    snippet: `${agent.name} materialized into arena`
  });

  // Plan 07 wake: seed inbox so the dispatcher picks the agent up.
  seedPostSpawnInbox(agentId, agent, hrSystem);

  return { agentId, agent };
}

export function spawnAgentViaHr(role, projectId = 'global', customName = null, options = {}) {
  assertKnownRole(role);
  const hrSystem = loadHrSystem();
  const cleanProjectId = projectId === 'global' ? 'global' : slugifyProjectId(projectId);
  const baseId = cleanProjectId === 'global' ? role : `${cleanProjectId}-${role}`;
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
    project: cleanProjectId,
    status: 'active',
    appearance: options.appearance || randomAppearance(),
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
    mcp: seedDefaultPermissions(role).mcp
  };

  hrSystem[agentId] = newAgent;
  saveHrSystem(hrSystem);

  appendAgentThought(agentId, 'INITIALIZE', `Spawned into project ${cleanProjectId} by HR Mind Flayer.`);
  // Generic path: durable HR → new-agent notice (model/harness/effort in body).
  // Visible in both drawers via queue projection; no HR-specific helper.
  try {
    enqueueDirectMessage({
      fromAgentId: 'hr-mind-flayer',
      toAgentId: agentId,
      projectId: cleanProjectId,
      message: `Agent ${newAgent.name} spawned into ${cleanProjectId}: model=${model} harness=${harness} effort=${effortLevel}` +
        (options.promptOverride ? ` specialization=${String(options.promptOverride).slice(0, 300)}` : '')
    });
  } catch {
    appendAgentMessage(agentId, {
      from: 'hr-mind-flayer',
      project: cleanProjectId,
      request: `Agent ${newAgent.name} successfully spawned and assigned to ${cleanProjectId}. System prompt initialized from template.`,
      path: getProjectFolder(cleanProjectId),
      role: 'system'
    });
    appendToSharedLog(`HR Mind Flayer spawned agent [${agentId}] for project [${cleanProjectId}]`);
  }

  // Plan 07 wake: seed inbox so the dispatcher picks the agent up.
  seedPostSpawnInbox(agentId, newAgent, hrSystem);

  broadcastAgentEvent({
    fromAgentId: 'hr-mind-flayer',
    toAgentId: agentId,
    type: 'agent_spawned',
    snippet: `${newAgent.name} spawned into ${cleanProjectId}`
  });

  return { agentId, agent: newAgent };
}

// Project creation is idempotent: a project always has exactly one default manager.
export function ensureProjectManager(projectId, options = {}) {
  const cleanProjectId = projectId === 'global' ? 'global' : slugifyProjectId(projectId);
  const hrSystem = loadHrSystem();
  const existing = Object.entries(hrSystem).find(([, agent]) =>
    agent.project === cleanProjectId && agent.role === 'manager-bard' && agent.status !== 'retired'
  );
  // Idempotent guarantee: no log spam when the manager already exists.
  if (existing) {
    return { agentId: existing[0], agent: existing[1], created: false };
  }
  return { ...spawnAgentViaHr('manager-bard', cleanProjectId, options.name || `Manager Bard (${cleanProjectId})`, options), created: true };
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
