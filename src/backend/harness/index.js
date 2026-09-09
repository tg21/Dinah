// Public API of the harness subsystem.
// Detection/discovery per harness lives in providers/; shared helpers in
// common.js; in-memory state in store.js; orchestration in registry.js.

export { findHarnessBinary, checkHttpEndpoint, buildModelCapability } from './common.js';
export {
  getAvailableModels,
  getDetectedHarnesses,
  getModelById,
  isRegistryInitialized
} from './store.js';
export { selectBestModelForRole } from './selector.js';
export { initializeHarnessesAndModels } from './registry.js';
