import { execSync } from 'child_process';
import { buildModelCapability } from '../common.js';

/**
 * Discover models from OpenCode harness.
 */
export function discoverOpencodeModels(binPath) {
  try {
    const output = execSync(`${binPath} models 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 10000
    });
    const lines = output
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('Commands:') && !l.startsWith('Options:') && !l.includes('█') && !l.includes('opencode ['));

    const models = [];
    for (const line of lines) {
      // Valid model entries are usually provider/model or simple names
      if (line.includes('/') || /^[a-z0-9_.-]+$/i.test(line)) {
        models.push(buildModelCapability(line, 'opencode'));
      }
    }
    return models;
  } catch (err) {
    console.warn('[HarnessRegistry] Could not query opencode models:', err.message);
    return [];
  }
}
