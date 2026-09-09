import { execSync } from 'child_process';
import { buildModelCapability, checkHttpEndpoint } from '../common.js';

/**
 * Discover models from Ollama harness.
 */
export async function discoverOllamaModels(binPath, host = 'http://localhost:11434') {
  // Try HTTP API first
  try {
    const res = await checkHttpEndpoint(`${host}/api/tags`, 1500);
    if (res.ok && res.data) {
      const json = JSON.parse(res.data);
      if (Array.isArray(json.models)) {
        return json.models.map(m => buildModelCapability(m.name, 'ollama', 'ollama-local'));
      }
    }
  } catch (e) { }

  // Try CLI binary
  if (binPath) {
    try {
      const output = execSync(`${binPath} list 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 });
      const lines = output.split('\n').slice(1);
      const models = [];
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts[0]) {
          models.push(buildModelCapability(parts[0], 'ollama', 'ollama-local'));
        }
      }
      return models;
    } catch (e) { }
  }

  return [];
}
