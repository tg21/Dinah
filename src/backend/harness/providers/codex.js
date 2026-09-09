import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildModelCapability } from '../common.js';

/**
 * Discover models from Codex / OpenAI CLI.
 */
export function discoverCodexModels(binPath) {
  // 1. Check local Codex CLI cache (populated via OAuth/login)
  const homeDir = os.homedir();
  const cachePath = path.join(homeDir, '.codex', 'models_cache.json');
  console.log(`Getting Codex Models from CLI cache at: ${cachePath}`);
  if (fs.existsSync(cachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (Array.isArray(data.models) && data.models.length > 0) {
        return data.models.map(m => buildModelCapability(m.slug, 'codex', 'openai'));
      }
    } catch (e) {
      console.warn('[HarnessRegistry] Failed to read Codex models_cache.json:', e.message);
    }
  }
  // 2. Fallback if no cache file exists
  if (!binPath && !process.env.OPENAI_API_KEY) return [];
  console.log('Codex: Using fallback Codex models');
  return [
    buildModelCapability('gpt-4o', 'codex', 'openai'),
    buildModelCapability('gpt-4o-mini', 'codex', 'openai'),
    buildModelCapability('o3-mini', 'codex', 'openai')
  ];
}
