import { execSync } from 'child_process';
import { buildModelCapability } from '../common.js';

/**
 * Discover models from Antigravity CLI (agy).
 */
export function discoverAntigravityModels(binPath) {
  try {
    const output = execSync(`${binPath} models 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 10000
    });
    const lines = output.split('\n');
    const models = [];
    for (const line of lines) {
      // Strip ANSI escape codes (from spinners or color output)
      const cleanLine = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
      if (!cleanLine) continue;
      // agy models output format: model-id<tab or spaces>Display Name
      const parts = cleanLine.split(/\s+/);
      const rawId = parts[0];
      if (!rawId || rawId.includes('Fetching') || rawId.startsWith('Usage:') || rawId.startsWith('Flags:')) {
        continue;
      }
      let provider = 'google';
      if (rawId.startsWith('claude')) provider = 'anthropic';
      else if (rawId.startsWith('gpt')) provider = 'openai';
      else if (rawId.startsWith('gemini')) provider = 'google';
      else provider = 'antigravity';

      models.push(buildModelCapability(rawId, 'antigravity', provider));
    }
    return models;
  } catch (err) {
    console.warn('[HarnessRegistry] Could not query antigravity models:', err.message);
    return [
      buildModelCapability('gemini-3.8-flash-high', 'antigravity', 'google'),
      buildModelCapability('gemini-3.8-flash-medium', 'antigravity', 'google'),
      buildModelCapability('gemini-3.8-flash-low', 'antigravity', 'google'),
      buildModelCapability('gemini-3.7-flash-high', 'antigravity', 'google'),
      buildModelCapability('gemini-3.1-pro-high', 'antigravity', 'google'),
      buildModelCapability('claude-sonnet-4-6', 'antigravity', 'anthropic'),
      buildModelCapability('claude-opus-4-6-thinking', 'antigravity', 'anthropic'),
      buildModelCapability('gpt-oss-120b-medium', 'antigravity', 'openai')
    ];
  }
}
