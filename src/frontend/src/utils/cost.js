// Cost estimation mirrors updateSpawnCostPreview() from the legacy frontend.html.
export function estimateSpawnCost(modelId = '', effort = 'Medium') {
  const multiplier =
    effort === 'Extreme' ? 3.0 : effort === 'High' ? 1.5 : effort === 'Low' ? 0.5 : 1.0;
  const fast =
    modelId.includes('flash') ||
    modelId.includes('lite') ||
    modelId.includes('haiku') ||
    modelId.includes('mini');
  const rate = fast ? 0.001 : 0.003;
  const estTokens = Math.round(4500 * multiplier);
  const estCost = ((estTokens / 1000) * rate * 3.5).toFixed(4);
  return { estTokens, estCost };
}

export function groupModelsByHarness(models = []) {
  const groups = {};
  for (const model of models) {
    const harness = model.source?.harness || 'system';
    const provider = model.source?.provider || harness;
    const key = `${harness.toUpperCase()} • ${provider}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(model);
  }
  return groups;
}

export function modelCapabilitiesLabel(model) {
  const caps = [];
  if (model.capabilities?.vision) caps.push('👁️ Vision');
  if (model.capabilities?.thinking || model.capabilities?.extendedThinking) caps.push('🧠 Thinking');
  if (model.capabilities?.tools) caps.push('🛠️ Tools');
  const capStr = caps.length ? ` [${caps.join(' ')}]` : '';
  const ctxStr = model.contextWindow ? ` (${Math.round(model.contextWindow / 1000)}k ctx)` : '';
  return `${model.displayName || model.id}${capStr}${ctxStr}`;
}
