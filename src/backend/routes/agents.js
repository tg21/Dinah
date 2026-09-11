import { Router } from 'express';
import { getModelById } from '../harness/index.js';
import { loadHrSystem, saveHrSystem } from '../services/hrService.js';
import {
  confirmAgentSummoning,
  requestAgentSummoning,
  spawnAgentViaHr
} from '../services/agentLifecycle.js';
import { appendToSharedLog } from '../services/messageService.js';
import { broadcastAgentEvent } from '../services/eventBus.js';
import { sanitizeMcpPermissions } from '../mcp/index.js';
import { cancelHarnessAgent } from '../services/harnessRunner.js';

const router = Router();

// Get all agents registry
router.get('/api/agents', (req, res) => {
  const hrSystem = loadHrSystem();
  res.json({ agents: hrSystem });
});

// Request Summoning (places agent in "awaiting-confirmation" state)
router.post('/api/agents/request-summon', (req, res) => {
  const { role, projectId = 'project-alpha', name, model, harness, effortLevel, promptOverride, requesterId } = req.body;
  if (!role) return res.status(400).json({ error: 'Agent role is required' });

  try {
    const result = requestAgentSummoning(role, projectId, { name, model, harness, effortLevel, promptOverride, requesterId });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Confirm Summoning (manifests agent into active status)
router.post('/api/agents/confirm-summon', (req, res) => {
  const { agentId, updatedParams } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });

  try {
    const result = confirmAgentSummoning(agentId, updatedParams || {});
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Update Agent configuration (Name, Stats, Model, Effort, Prompt)
router.post('/api/agents/update', (req, res) => {
  const { agentId, updates } = req.body;
  if (!agentId || !updates) return res.status(400).json({ error: 'agentId and updates are required' });

  const hrSystem = loadHrSystem();
  if (!hrSystem[agentId]) return res.status(404).json({ error: `Agent ${agentId} not found` });

  const agent = hrSystem[agentId];
  if (updates.name) agent.name = updates.name;
  if (updates.model) {
    agent.model = updates.model;
    const modelCap = getModelById(updates.model);
    if (modelCap) {
      agent.harness = modelCap.source.harness;
      agent.context_len = modelCap.contextWindow || agent.context_len || 128000;
    }
  }
  if (updates.harness) agent.harness = updates.harness;
  if (updates.effortLevel) agent.effortLevel = updates.effortLevel;
  if (updates.promptOverride !== undefined) agent.promptOverride = updates.promptOverride;
  if (updates.mcp !== undefined) agent.mcp = sanitizeMcpPermissions(updates.mcp);
  if (updates.stats) {
    agent.stats = { ...agent.stats, ...updates.stats };
  }

  saveHrSystem(hrSystem);
  appendToSharedLog(`Configured agent [${agentId}] (${agent.name}) with updated parameters.`);
  broadcastAgentEvent({
    fromAgentId: 'system',
    toAgentId: agentId,
    type: 'agent_updated',
    snippet: `Agent ${agentId} updated`
  });
  res.json({ success: true, agent });
});

// Set Agent status (active, working, paused, retired)
router.post('/api/agents/set-status', (req, res) => {
  const { agentId, status } = req.body;
  if (!agentId || !status) return res.status(400).json({ error: 'agentId and status are required' });

  const hrSystem = loadHrSystem();
  if (!hrSystem[agentId]) return res.status(404).json({ error: `Agent ${agentId} not found` });

  hrSystem[agentId].status = status;
  saveHrSystem(hrSystem);
  appendToSharedLog(`Agent [${agentId}] status changed to [${status}].`);
  broadcastAgentEvent({
    fromAgentId: 'system',
    toAgentId: agentId,
    type: 'agent_status_changed',
    snippet: `Agent ${agentId} → ${status}`
  });
  res.json({ success: true, agentId, status });
});

// Explicitly stop a running harness; elapsed time never stops an agent.
router.post('/api/agents/cancel', (req, res) => {
  const { agentId, signal = 'SIGTERM' } = req.body || {};
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });
  if (!['SIGTERM', 'SIGINT', 'SIGKILL'].includes(signal)) {
    return res.status(400).json({ error: 'Unsupported cancellation signal' });
  }
  const cancelled = cancelHarnessAgent(agentId, signal);
  res.json({ success: cancelled, agentId, signal, message: cancelled ? 'Cancellation requested' : 'No running harness found' });
});

// Standard direct spawn via HR
router.post('/api/agents/spawn', (req, res) => {
  const { role, projectId = 'global', customName, model, harness, effortLevel, promptOverride } = req.body;
  if (!role) {
    return res.status(400).json({ error: 'Agent role is required' });
  }
  try {
    const result = spawnAgentViaHr(role, projectId, customName, { model, harness, effortLevel, promptOverride });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
