import { buildModelCapability } from '../common.js';

/**
 * Discover models from Claude Code CLI.
 */
export function discoverClaudeCodeModels(binPath) {
  if (!binPath && !process.env.ANTHROPIC_API_KEY) return [];
  // Concrete IDs (kept for existing HR records) plus the latest-model
  // aliases documented in `claude --help` (`--model`: 'fable', 'opus', 'sonnet').
  return [
    buildModelCapability('sonnet', 'claude-code', 'anthropic'),
    buildModelCapability('opus', 'claude-code', 'anthropic'),
    buildModelCapability('claude-3-7-sonnet', 'claude-code', 'anthropic'),
    buildModelCapability('claude-3-5-sonnet', 'claude-code', 'anthropic'),
    buildModelCapability('claude-3-5-haiku', 'claude-code', 'anthropic')
  ];
}
