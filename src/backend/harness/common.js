import { execSync } from 'child_process';
import fs from 'fs';
import http from 'http';

/**
 * @typedef {Object} ModelCapability
 * @property {string} id
 * @property {string} displayName
 * @property {{
 *   text: boolean,
 *   vision: boolean,
 *   tools: boolean,
 *   parallelTools?: boolean,
 *   thinking?: boolean,
 *   extendedThinking?: boolean
 * }} capabilities
 * @property {{
 *   type: "effort" | "budget" | "variant" | "none",
 *   levels?: string[],
 *   minTokens?: number,
 *   maxTokens?: number
 * }} [reasoning]
 * @property {number} [contextWindow]
 * @property {{
 *   harness: string,
 *   provider?: string
 * }} source
 */

/**
 * Check if a CLI binary exists in PATH or common directories.
 */
export function findHarnessBinary(binaryName) {
  const commonPaths = [
    binaryName,
    `/usr/bin/${binaryName}`,
    `/usr/local/bin/${binaryName}`,
    `${process.env.HOME}/.local/bin/${binaryName}`,
    `${process.env.HOME}/.cargo/bin/${binaryName}`,
    `${process.env.HOME}/.npm-global/bin/${binaryName}`
  ];

  for (const p of commonPaths) {
    if (p.startsWith('/') && fs.existsSync(p)) {
      return p;
    }
    try {
      const result = execSync(`which ${binaryName} 2>/dev/null`, { encoding: 'utf-8', timeout: 1500 });
      if (result && result.trim()) {
        return result.trim();
      }
    } catch (e) { }
  }
  return null;
}

/**
 * Check if a local HTTP endpoint is responsive.
 */
export function checkHttpEndpoint(url, timeoutMs = 1000) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const req = http.get({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        timeout: timeoutMs
      }, (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
            resolve({ ok: true, data: raw });
          } else {
            resolve({ ok: false });
          }
        });
      });
      req.on('error', () => resolve({ ok: false }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false });
      });
    } catch (err) {
      resolve({ ok: false });
    }
  });
}

/**
 * Infer ModelCapability fields from model identifier and provider.
 */
export function buildModelCapability(rawId, harnessName, explicitProvider = null) {
  let id = rawId.trim();
  let provider = explicitProvider;

  if (id.includes('/')) {
    const parts = id.split('/');
    provider = provider || parts[0];
  } else if (!provider) {
    if (id.startsWith('claude')) provider = 'anthropic';
    else if (id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3')) provider = 'openai';
    else if (id.startsWith('gemini')) provider = 'google';
    else if (id.startsWith('deepseek')) provider = 'deepseek';
    else if (id.startsWith('llama') || id.startsWith('qwen') || id.startsWith('mistral')) provider = 'open-weights';
    else provider = harnessName;
  }

  // Format clean display name
  const modelPart = id.includes('/') ? id.split('/').slice(1).join('/') : id;
  const displayName = modelPart
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\bLite\b/i, 'Lite')
    .replace(/\bExp\b/i, 'Experimental')
    .replace(/\bTts\b/i, 'TTS')
    .replace(/\bIt\b/i, 'Instruct');

  const lower = id.toLowerCase();

  // Determine Vision capability
  const vision = lower.includes('vision') ||
    lower.includes('image') ||
    lower.includes('omni') ||
    lower.includes('clip') ||
    lower.includes('veo') ||
    lower.includes('llava') ||
    lower.includes('vl') ||
    lower.includes('pro') ||
    lower.includes('gemini-2') ||
    lower.includes('gemini-3') ||
    lower.includes('gpt-4o');

  // Determine Thinking / Reasoning capability
  const isThinking = lower.includes('thinking') ||
    lower.includes('reason') ||
    lower.includes('r1') ||
    lower.includes('o1') ||
    lower.includes('o3') ||
    lower.includes('sonnet') ||
    lower.includes('pro') ||
    lower.includes('ultra');

  const isExtendedThinking = lower.includes('thinking') ||
    lower.includes('r1') ||
    lower.includes('o1') ||
    lower.includes('o3') ||
    lower.includes('sonnet-2025') ||
    lower.includes('gemini-3');

  // Determine Tools capability
  const hasTools = !lower.includes('tts') &&
    !lower.includes('clip') &&
    !lower.includes('veo') &&
    !lower.includes('embedding');

  const parallelTools = hasTools && (
    lower.includes('flash') ||
    lower.includes('pro') ||
    lower.includes('gpt-4') ||
    lower.includes('claude-3') ||
    lower.includes('sonnet')
  );

  // Reasoning configuration
  let reasoningType = "none";
  let reasoningLevels = undefined;
  if (isExtendedThinking) {
    reasoningType = "effort";
    reasoningLevels = ["Low", "Medium", "High", "Extreme"];
  } else if (isThinking) {
    reasoningType = "effort";
    reasoningLevels = ["Low", "Medium", "High"];
  }

  // Estimate context window
  let contextWindow = 128000;
  if (lower.includes('gemini-2') || lower.includes('gemini-3')) {
    contextWindow = lower.includes('pro') ? 2000000 : 1000000;
  } else if (lower.includes('claude-3')) {
    contextWindow = 200000;
  } else if (lower.includes('deepseek')) {
    contextWindow = 128000;
  } else if (lower.includes('gpt-4o')) {
    contextWindow = 128000;
  } else if (lower.includes('8b') || lower.includes('7b') || lower.includes('lite')) {
    contextWindow = 64000;
  }

  return {
    id,
    displayName: `${displayName} (${provider.toUpperCase()})`,
    capabilities: {
      text: true,
      vision,
      tools: hasTools,
      parallelTools,
      thinking: isThinking,
      extendedThinking: isExtendedThinking
    },
    reasoning: {
      type: reasoningType,
      ...(reasoningLevels ? { levels: reasoningLevels } : {}),
      ...(isThinking ? { minTokens: 1024, maxTokens: 64000 } : {})
    },
    contextWindow,
    source: {
      harness: harnessName,
      provider
    }
  };
}
