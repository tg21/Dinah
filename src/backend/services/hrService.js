import fs from 'fs';
import {
  HR_SYSTEM_FILE,
  STARTUP_SETUP_FILE,
  TOP_LEVEL_AGENT_IDS
} from '../config.js';
import { AGENT_RPG_REGISTRY } from '../data/rpgRegistry.js';
import { getModelById, selectBestModelForRole } from '../harness/index.js';
import { ensureAgentMcpDefaults } from '../mcp/permissions.js';

// Cosmetic-only appearance seed (mirrors agentLifecycle.randomAppearance
// without importing it to avoid a cycle). Stable per overseer id so global
// portraits don't reshuffle on every boot.
function randomOverseerAppearance(ovId = '') {
  let h = 0;
  for (let i = 0; i < String(ovId).length; i++) h = (h * 31 + String(ovId).charCodeAt(i)) >>> 0;
  return { paletteId: h % 8, variant: Math.floor(h / 7) % 3 };
}

function ensureAppearance(agent, seed = '') {
  if (agent.appearance && typeof agent.appearance.paletteId === 'number') return false;
  let h = 0;
  const s = String(seed || agent.role || agent.name || 'agent');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  agent.appearance = { paletteId: h % 8, variant: Math.floor(h / 7) % 3 };
  return true;
}

export function createOverseerAgent(ovId) {
  const rpgStats = AGENT_RPG_REGISTRY[ovId] || {};
  const bestModel = selectBestModelForRole(ovId);
  const agent = {
    name: rpgStats.name || ovId,
    role: ovId,
    project: 'global',
    status: 'active',
    appearance: randomOverseerAppearance(ovId),
    harness: bestModel?.source?.harness || 'opencode',
    model: bestModel?.id || 'system-simulator/balanced-agent',
    effortLevel: rpgStats.effortLevel || (bestModel?.reasoning?.type === 'effort' ? 'High' : 'Medium'),
    context_len: bestModel?.contextWindow || rpgStats.contextCapacity || 128000,
    context_used: 4200,
    created_at: new Date().toISOString(),
    last_activity_ms: Date.now(),
    stats: rpgStats,
    mcp: {}
  };
  // Seed orchestration + role-derived tool defaults (plans 04+05).
  ensureAgentMcpDefaults(agent);
  return agent;
}

export function loadHrSystem() {
  const defaultOverseers = [
    'ceo-warlock',
    'hr-mind-flayer',
    'staff-engineer-paladin',
    'senior-analyst-diviner',
    'marshall-agent-system-inspector'
  ];

  if (!fs.existsSync(HR_SYSTEM_FILE)) {
    const initialRegistry = {};
    for (const ovId of defaultOverseers) {
      initialRegistry[ovId] = createOverseerAgent(ovId);
    }
    fs.writeFileSync(HR_SYSTEM_FILE, JSON.stringify(initialRegistry, null, 2));
    return initialRegistry;
  }
  try {
    const data = JSON.parse(fs.readFileSync(HR_SYSTEM_FILE, 'utf-8'));
    let modified = false;

    // Ensure all global overseer agents exist
    for (const ovId of defaultOverseers) {
      if (!data[ovId]) {
        data[ovId] = createOverseerAgent(ovId);
        modified = true;
      }
    }

    // Dynamic model reconciliation:
    // - Missing model: pick the best discovered model for the role (new agents).
    // - Explicit model that is currently undiscovered (detection skew at boot,
    //   provider hiccup, renamed id): KEEP it untouched. Re-picking here used
    //   to silently flip agents to a different provider+harness, overriding
    //   deliberate configuration. A stale-but-explicit model fails loudly at
    //   dispatch time instead of surprising everyone with a new provider.
    // - Discovered model with a mismatched harness field: align the field.
    for (const agentId of Object.keys(data)) {
      const agent = data[agentId];
      if (!agent.model) {
        const bestModel = selectBestModelForRole(agent.role);
        if (bestModel) {
          agent.model = bestModel.id;
          agent.harness = bestModel.source.harness;
          if (!agent.context_len || agent.context_len === 200000) {
            agent.context_len = bestModel.contextWindow || agent.context_len || 128000;
          }
          modified = true;
        }
      }
      const modelExists = getModelById(agent.model);
      if (modelExists) {
        // Ensure harness is aligned with model's actual harness
        if (agent.harness !== modelExists.source.harness) {
          agent.harness = modelExists.source.harness;
          modified = true;
        }
      }
      // Backfill seeded MCP defaults for legacy records (plans 04+05).
      // Explicit enabled:false is preserved by ensureAgentMcpDefaults.
      const { applied } = ensureAgentMcpDefaults(agent);
      if (applied) modified = true;
      // Backfill cosmetic appearance for pre-refactor records (stable by id).
      if (ensureAppearance(agent, agentId)) modified = true;
    }

    if (modified) {
      fs.writeFileSync(HR_SYSTEM_FILE, JSON.stringify(data, null, 2));
    }
    return data;
  } catch (e) {
    return {};
  }
}

export function saveHrSystem(hrSystem) {
  fs.writeFileSync(HR_SYSTEM_FILE, JSON.stringify(hrSystem, null, 2));
}

export function loadStartupSetup() {
  if (!fs.existsSync(STARTUP_SETUP_FILE)) return { configured: false };
  try {
    return JSON.parse(fs.readFileSync(STARTUP_SETUP_FILE, 'utf-8'));
  } catch (e) {
    return { configured: false };
  }
}

export function applyStartupSetup({ ceoModel, topLevelAssignments = {} }) {
  const hrSystem = loadHrSystem();
  const modelFor = (modelId, role) => {
    const selected =
      modelId === 'ceo' || !modelId ? selectBestModelForRole(role) : getModelById(modelId);
    return selected || selectBestModelForRole(role);
  };

  const assignModel = (agentId, requestedModel) => {
    const agent = hrSystem[agentId];
    const selected = modelFor(requestedModel, agent?.role || agentId);
    if (!agent || !selected) return;
    agent.model = selected.id;
    agent.harness = selected.source?.harness || agent.harness;
    agent.context_len = selected.contextWindow || agent.context_len || 128000;
  };

  assignModel('ceo-warlock', ceoModel);
  for (const agentId of TOP_LEVEL_AGENT_IDS) {
    assignModel(agentId, topLevelAssignments[agentId] || 'ceo');
    if (hrSystem[agentId]) {
      hrSystem[agentId].modelAssignment =
        topLevelAssignments[agentId] && topLevelAssignments[agentId] !== 'ceo'
          ? 'specified'
          : 'ceo-delegated';
    }
  }
  saveHrSystem(hrSystem);

  const setup = {
    configured: true,
    version: 1,
    configuredAt: new Date().toISOString(),
    ceoModel: hrSystem['ceo-warlock']?.model || ceoModel,
    topLevelAssignments: Object.fromEntries(
      TOP_LEVEL_AGENT_IDS.map((id) => [
        id,
        topLevelAssignments[id] && topLevelAssignments[id] !== 'ceo' ? topLevelAssignments[id] : 'ceo'
      ])
    )
  };
  fs.writeFileSync(STARTUP_SETUP_FILE, JSON.stringify(setup, null, 2));
  return setup;
}
