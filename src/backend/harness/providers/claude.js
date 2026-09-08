import { buildModelCapability } from '../common.js';

/**
 * Discover models from Claude Code CLI.
 */
export function discoverClaudeCodeModels(binPath) {
  if (!binPath && !process.env.ANTHROPIC_API_KEY) return [];
  // Standard models exposed by claude CLI
  return [
    buildModelCapability('claude-3-7-sonnet', 'claude-code', 'anthropic'),
    buildModelCapability('claude-3-5-sonnet', 'claude-code', 'anthropic'),
    buildModelCapability('claude-3-5-haiku', 'claude-code', 'anthropic')
  ];
}
