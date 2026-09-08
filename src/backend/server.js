import {
  getAvailableModels,
  getDetectedHarnesses,
  initializeHarnessesAndModels
} from './harness/index.js';
import { PORT } from './config.js';
import { loadHrSystem } from './services/hrService.js';
import { loadProjectsConfig } from './services/projectService.js';
import { loadKnowledgeBase, startSeniorAnalystScheduler } from './services/knowledgeService.js';
import { startMarshallScheduler } from './services/marshallService.js';
import { createApp } from './app.js';

export const app = createApp();

// Top-level startup: Query system for available harnesses and models first
console.log('🚀 Initializing system harnesses and model discovery...');
await initializeHarnessesAndModels();

loadHrSystem();
loadKnowledgeBase();
loadProjectsConfig();

startSeniorAnalystScheduler();
startMarshallScheduler();

app.listen(PORT, () => {
  const harnesses = getDetectedHarnesses();
  const models = getAvailableModels();
  console.log(`====================================================`);
  console.log(`🏰 DND Multi-Agent System Server is LIVE`);
  console.log(`🌐 Web UI: http://localhost:${PORT}`);
  console.log(
    `⚡ Detected AI Harnesses: ${harnesses.map((h) => `${h.name} (${h.modelCount} models)`).join(', ') || 'None (Simulated)'}`
  );
  console.log(`🧠 Discovered System Models: ${models.length} available dynamically`);
  console.log(`🛡️ Marshall Watchdog Cycle: Active (every 5 mins)`);
  console.log(`🔮 Senior Analyst Scribe: Active (every 5 mins)`);
  console.log(`====================================================`);
});
