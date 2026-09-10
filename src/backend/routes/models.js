import { Router } from 'express';
import fs from 'fs';
import {
  getAvailableModels,
  getDetectedHarnesses,
  getModelById,
  initializeHarnessesAndModels
} from '../harness/index.js';
import { STARTUP_SETUP_FILE, TOP_LEVEL_AGENT_IDS } from '../config.js';
import { applyStartupSetup, loadHrSystem, loadStartupSetup, saveHrSystem } from '../services/hrService.js';
import { selectTopLevelModelsByCeo } from '../services/startupService.js';
import { appendToSharedLog } from '../services/messageService.js';

const router = Router();

router.get('/api/harnesses', (req, res) => {
  res.json({ harnesses: getDetectedHarnesses() });
});

router.get('/api/models', (req, res) => {
  res.json({ models: getAvailableModels() });
});

router.get('/api/startup-setup', (req, res) => {
  res.json({ setup: loadStartupSetup(), topLevelAgentIds: TOP_LEVEL_AGENT_IDS });
});

router.post('/api/startup-setup', async (req, res) => {
  const { ceoModel, topLevelAssignments = {} } = req.body || {};
  if (!ceoModel) return res.status(400).json({ error: 'A CEO model is required.' });
  if (!getModelById(ceoModel)) return res.status(400).json({ error: 'The selected CEO model is not available.' });

  for (const [agentId, modelId] of Object.entries(topLevelAssignments)) {
    if (!TOP_LEVEL_AGENT_IDS.includes(agentId)) {
      return res.status(400).json({ error: `Unknown top-level agent: ${agentId}` });
    }
    if (modelId !== 'ceo' && !getModelById(modelId)) {
      return res.status(400).json({ error: `Selected model is not available for ${agentId}.` });
    }
  }

  // Persist the selected CEO model before invoking the CEO so the request is
  // actually executed with the model chosen in the frontend.
  applyStartupSetup({ ceoModel, topLevelAssignments: {} });
  const ceoSelections = await selectTopLevelModelsByCeo(ceoModel, topLevelAssignments);
  const resolvedAssignments = { ...topLevelAssignments, ...ceoSelections.assignments };
  const setup = applyStartupSetup({ ceoModel, topLevelAssignments: resolvedAssignments });
  setup.topLevelAssignments = Object.fromEntries(
    TOP_LEVEL_AGENT_IDS.map((id) => [
      id,
      topLevelAssignments[id] && topLevelAssignments[id] !== 'ceo' ? topLevelAssignments[id] : 'ceo'
    ])
  );
  setup.resolvedTopLevelAssignments = Object.fromEntries(
    TOP_LEVEL_AGENT_IDS.map((id) => [id, resolvedAssignments[id] || null])
  );
  setup.ceoSelection = {
    source: ceoSelections.source,
    requestedAgentIds: Object.keys(ceoSelections.assignments)
  };
  const finalHrSystem = loadHrSystem();
  for (const agentId of TOP_LEVEL_AGENT_IDS) {
    if (finalHrSystem[agentId]) {
      finalHrSystem[agentId].modelAssignment =
        topLevelAssignments[agentId] && topLevelAssignments[agentId] !== 'ceo'
          ? 'specified'
          : 'ceo-delegated';
    }
  }
  saveHrSystem(finalHrSystem);
  fs.writeFileSync(STARTUP_SETUP_FILE, JSON.stringify(setup, null, 2));
  appendToSharedLog(`Completed DND Guild startup setup. CEO model: [${setup.ceoModel}].`);
  res.json({ success: true, setup });
});

router.post('/api/models/refresh', async (req, res) => {
  try {
    const result = await initializeHarnessesAndModels(true);
    // Also re-reconcile HR system agents if needed
    loadHrSystem();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
