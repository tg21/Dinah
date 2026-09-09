// In-memory registry of detected harnesses and available models.
// Single owner of discovery state; registry.js writes it, everyone else reads it.

let detectedHarnesses = [];
let availableModels = [];
let isInitialized = false;

/**
 * Get all currently discovered models.
 */
export function getAvailableModels() {
  return availableModels;
}

/**
 * Get all detected harnesses.
 */
export function getDetectedHarnesses() {
  return detectedHarnesses;
}

export function isRegistryInitialized() {
  return isInitialized;
}

export function setRegistry(harnesses, models) {
  detectedHarnesses = harnesses;
  availableModels = models;
  isInitialized = true;
}

/**
 * Find a specific ModelCapability by ID.
 */
export function getModelById(modelId) {
  if (!modelId) return null;
  return availableModels.find(m => m.id === modelId || m.id.endsWith(`/${modelId}`)) || null;
}
