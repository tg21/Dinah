import { buildModelCapability } from '../common.js';

/**
 * Discover models from Gemini CLI.
 */
export function discoverGeminiModels(binPath) {
  if (!binPath && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) return [];
  return [
    buildModelCapability('gemini-2.5-pro', 'gemini', 'google'),
    buildModelCapability('gemini-2.5-flash', 'gemini', 'google'),
    buildModelCapability('gemini-2.0-flash', 'gemini', 'google')
  ];
}
