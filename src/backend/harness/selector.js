import { getAvailableModels, getModelById } from './store.js';

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

  // 1. Roles requiring Deep Reasoning / Thinking (Executive, Architecture, Analysis, Security)
  if (r.includes('ceo') || r.includes('architect') || r.includes('wizard') || r.includes('analyst') || r.includes('diviner') || r.includes('lich')) {
    const thinkingModel = availableModels.find(m => m.capabilities.extendedThinking || m.capabilities.thinking);
    if (thinkingModel) return thinkingModel;
    const proModel = availableModels.find(m => m.id.includes('pro') || m.id.includes('sonnet') || m.id.includes('r1'));
    if (proModel) return proModel;
  }

  // 2. Roles requiring Vision / UI / CSS Layouts (Frontend Sorcerer, Designers)
  if (r.includes('frontend') || r.includes('sorcerer') || r.includes('design') || r.includes('sculptor')) {
    const visionModel = availableModels.find(m => m.capabilities.vision && m.capabilities.tools);
    if (visionModel) return visionModel;
  }

  // 3. Fast / High-throughput engineering & QA roles (Backend Cleric, QA Rogue, DevOps, Interns)
  if (r.includes('backend') || r.includes('cleric') || r.includes('qa') || r.includes('rogue') || r.includes('devops') || r.includes('warmage') || r.includes('intern')) {
    const flashOrToolModel = availableModels.find(m => (m.id.includes('flash') || m.id.includes('coder') || m.id.includes('haiku')) && m.capabilities.tools);
    if (flashOrToolModel) return flashOrToolModel;
  }

  // 4. General tool-capable model
  const toolModel = availableModels.find(m => m.capabilities.tools && !m.id.includes('tts') && !m.id.includes('clip'));
  if (toolModel) return toolModel;

  // Fallback to first available model
  return availableModels[0];
}
