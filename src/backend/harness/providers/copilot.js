import { buildModelCapability } from '../common.js';

/**
 * Discover models from GitHub Copilot CLI.
 *
 * `copilot` has no `models` subcommand, so discovery is a static list:
 * - `mai-code-1.1-flash`: observed live 2026-09-12 as the auto-resolved model
 *   in `--output-format json` session events.
 * - `auto`: documented in `copilot --help` ("use 'auto' to let Copilot pick
 *   automatically") and valid for `--model`.
 */
export function discoverCopilotModels(binPath) {
  if (!binPath) return [];
  return [
    buildModelCapability('mai-code-1.1-flash', 'copilot', 'github'),
    buildModelCapability('auto', 'copilot', 'github')
  ];
}
