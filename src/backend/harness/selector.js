import { getAvailableModels, getModelById } from './store.js';
import { loadAgentDefinition } from '../services/agentDefinitions.js';

/**
 * Select the most capable or suitable model for a given agent role from discovered system models.
 * Matches agent role requirements (e.g. executive reasoning vs fast coding vs vision).
 */
export function selectBestModelForRole(role, preferredModelId = null) {
  const availableModels = getAvailableModels();
  if (availableModels.length === 0) {
    return null;
  }

  // If preferred model is available, use it
  if (preferredModelId) {
    const direct = getModelById(preferredModelId);
    if (direct) return direct;
  }

  const r = (role || '').toLowerCase();
  const policy = loadAgentDefinition(role)?.modelPolicy || {};

  const matchesPolicy = (model) => {
    const capabilities = model.capabilities || {};
    const required = policy.preferredCapabilities || [];
    if (required.some((capability) => !capabilities[capability])) return false;
    return (model.contextWindow || 0) >= (policy.minimumContextWindow || 0);
  };
  const policyModels = availableModels.filter(matchesPolicy);
  const candidates = policyModels.length ? policyModels : availableModels;
  const hints = policy.preferredModelHints || [];
  const hinted = candidates.find((model) => hints.some((hint) => model.id.toLowerCase().includes(hint)));
  if (hinted) return hinted;

  // 1. Roles requiring Deep Reasoning / Thinking (Executive, Architecture, Analysis, Security)
  if (r.includes('ceo') || r.includes('architect') || r.includes('wizard') || r.includes('analyst') || r.includes('diviner') || r.includes('lich')) {
    const thinkingModel = candidates.find(m => m.capabilities.extendedThinking || m.capabilities.thinking);
    if (thinkingModel) return thinkingModel;
    const proModel = candidates.find(m => m.id.includes('pro') || m.id.includes('sonnet') || m.id.includes('r1'));
    if (proModel) return proModel;
  }

  // 2. Roles requiring Vision / UI / CSS Layouts (Frontend Sorcerer, Designers)
  if (r.includes('frontend') || r.includes('sorcerer') || r.includes('design') || r.includes('sculptor')) {
    const visionModel = candidates.find(m => m.capabilities.vision && m.capabilities.tools);
    if (visionModel) return visionModel;
  }

  // 3. Fast / High-throughput engineering & QA roles (Backend Cleric, QA Rogue, DevOps, Interns)
  if (r.includes('backend') || r.includes('cleric') || r.includes('qa') || r.includes('rogue') || r.includes('devops') || r.includes('warmage') || r.includes('intern')) {
    const flashOrToolModel = candidates.find(m => (m.id.includes('flash') || m.id.includes('coder') || m.id.includes('haiku')) && m.capabilities.tools);
    if (flashOrToolModel) return flashOrToolModel;
  }

  // 4. General tool-capable model
  const toolModel = candidates.find(m => m.capabilities.tools && !m.id.includes('tts') && !m.id.includes('clip'));
  if (toolModel) return toolModel;

  // Fallback to first available model
  return availableModels[0];
}
