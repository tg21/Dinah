import fs from 'fs';
import path from 'path';
import { APP_DIR, PROMPTS_DIR, STARTUP_SELECTION_AUDIT_FILE, TOP_LEVEL_AGENT_IDS } from '../config.js';
import { AGENT_RPG_REGISTRY } from '../data/rpgRegistry.js';
import { getAvailableModels, getModelById, selectBestModelForRole } from '../harness/index.js';
import { loadHrSystem } from './hrService.js';
import { appendAgentMessage, appendAgentThought, appendToSharedLog } from './messageService.js';
import { spawnHarnessAgent } from './harnessRunner.js';

export function readCeoModelSelectionPrompt(modelCandidates) {
  const promptFile = path.join(PROMPTS_DIR, 'ceo-select-top-level-models.md');
  const template = fs.readFileSync(promptFile, 'utf-8');
  return `${template}\n\n## Available model candidates\n\n${JSON.stringify(modelCandidates, null, 2)}\n\nReturn only the JSON object requested by the prompt.`;
}

export function extractJsonObject(output) {
  if (!output) return null;
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] || output.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch (e) {
    return null;
  }
}

export async function selectTopLevelModelsByCeo(ceoModel, requestedAssignments) {
  const delegatedIds = TOP_LEVEL_AGENT_IDS.filter(
    (id) => !requestedAssignments[id] || requestedAssignments[id] === 'ceo'
  );
  if (delegatedIds.length === 0) return { assignments: {}, source: 'none' };

  const candidates = getAvailableModels().map((model) => ({
    id: model.id,
    displayName: model.displayName,
    harness: model.source?.harness,
    provider: model.source?.provider,
    capabilities: model.capabilities,
    reasoning: model.reasoning,
    contextWindow: model.contextWindow
  }));
  const roles = delegatedIds.map((agentId) => ({
    agentId,
    role: AGENT_RPG_REGISTRY[agentId]?.roleFocus || agentId,
    requiredCapabilities: AGENT_RPG_REGISTRY[agentId]?.requiredCapabilities || [],
    effortLevel: AGENT_RPG_REGISTRY[agentId]?.effortLevel || 'High'
  }));
  const prompt = readCeoModelSelectionPrompt({ ceoModel, roles, candidates });
  const ceo = loadHrSystem()['ceo-warlock'];
  appendAgentMessage('ceo-warlock', {
    from: 'system',
    role: 'system',
    project: 'global',
    path: APP_DIR,
    request: `CEO requested to select models and harnesses for ${delegatedIds.join(', ')}. Evaluation criteria and candidates were provided in prompts/ceo-select-top-level-models.md.`
  });
  appendAgentThought(
    'ceo-warlock',
    'MODEL_SELECTION_REQUEST',
    `Evaluating available models and harnesses on capability, context, reliability, and cost merit for: ${delegatedIds.join(', ')}.`
  );
  const startedAt = Date.now();
  const result = await spawnHarnessAgent(ceo?.harness || 'opencode', 'global', prompt, 'ceo-warlock');
  const decision = extractJsonObject(result.output);
  const assignments = {};
  for (const agentId of delegatedIds) {
    const modelId = decision?.assignments?.[agentId]?.modelId || decision?.assignments?.[agentId]?.model;
    const model = getModelById(modelId);
    if (model) assignments[agentId] = model.id;
  }

  // A non-JSON response must not leave an agent unconfigured. This deterministic
  // fallback uses the same capability-based selector and never prefers a provider.
  for (const agentId of delegatedIds) {
    if (!assignments[agentId]) assignments[agentId] = selectBestModelForRole(agentId)?.id;
  }
  const source =
    decision && Object.keys(assignments).some((id) => decision.assignments?.[id])
      ? 'ceo'
      : 'capability-fallback';
  const audit = {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    ceoModel,
    harness: result.harness || ceo?.harness || null,
    simulated: Boolean(result.simulated),
    requestedAgentIds: delegatedIds,
    prompt,
    rawResponse: result.output || '',
    parsedDecision: decision,
    source,
    resolvedAssignments: assignments
  };
  fs.writeFileSync(STARTUP_SELECTION_AUDIT_FILE, JSON.stringify(audit, null, 2));
  appendAgentMessage('ceo-warlock', {
    from: 'CEO Warlock',
    role: 'agent',
    project: 'global',
    path: APP_DIR,
    request: `Model selection completed for ${delegatedIds.join(', ')}. Source: ${source}. Assignments: ${JSON.stringify(assignments)}. Full prompt/response audit: shared-state/startup-model-selection.json.`
  });
  appendAgentThought(
    'ceo-warlock',
    'MODEL_SELECTION_COMPLETE',
    `Selected top-level model assignments by merit (${source}): ${JSON.stringify(assignments)}. Full exchange saved to shared-state/startup-model-selection.json.`
  );
  appendToSharedLog(
    `CEO Warlock completed top-level model selection (${source}): ${JSON.stringify(assignments)}`
  );
  return { assignments, source, response: result.output };
}
