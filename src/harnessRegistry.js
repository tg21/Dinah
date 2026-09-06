import { execSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

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

// In-memory registry of detected harnesses and available models
let detectedHarnesses = [];
let availableModels = [];
let isInitialized = false;

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
function checkHttpEndpoint(url, timeoutMs = 1000) {
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
function buildModelCapability(rawId, harnessName, explicitProvider = null) {
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

/**
 * Discover models from OpenCode harness.
 */
function discoverOpencodeModels(binPath) {
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

/**
 * Discover models from Antigravity CLI (agy).
 */
function discoverAntigravityModels(binPath) {
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

/**
 * Discover models from Ollama harness.
 */
async function discoverOllamaModels(binPath, host = 'http://localhost:11434') {
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

/**
 * Discover models from Claude Code CLI.
 */
function discoverClaudeCodeModels(binPath) {
  if (!binPath && !process.env.ANTHROPIC_API_KEY) return [];
  // Standard models exposed by claude CLI
  return [
    buildModelCapability('claude-3-7-sonnet', 'claude-code', 'anthropic'),
    buildModelCapability('claude-3-5-sonnet', 'claude-code', 'anthropic'),
    buildModelCapability('claude-3-5-haiku', 'claude-code', 'anthropic')
  ];
}

/**
 * Discover models from Gemini CLI.
 */
function discoverGeminiModels(binPath) {
  if (!binPath && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) return [];
  return [
    buildModelCapability('gemini-2.5-pro', 'gemini', 'google'),
    buildModelCapability('gemini-2.5-flash', 'gemini', 'google'),
    buildModelCapability('gemini-2.0-flash', 'gemini', 'google')
  ];
}

/**
 * Discover models from Codex / OpenAI CLI.
 */
function discoverCodexModels(binPath) {
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

/**
 * Fallback simulation harness when no external AI harness is installed on host.
 */
function getSystemSimulatorModels() {
  return [
    {
      id: 'system-simulator/balanced-agent',
      displayName: 'System Simulator - Balanced Agent (LOCAL)',
      capabilities: {
        text: true,
        vision: true,
        tools: true,
        parallelTools: true,
        thinking: true,
        extendedThinking: true
      },
      reasoning: {
        type: 'effort',
        levels: ['Low', 'Medium', 'High', 'Extreme'],
        minTokens: 1000,
        maxTokens: 32000
      },
      contextWindow: 128000,
      source: {
        harness: 'system-simulator',
        provider: 'System Local'
      }
    },
    {
      id: 'system-simulator/fast-light',
      displayName: 'System Simulator - Fast Lightweight (LOCAL)',
      capabilities: {
        text: true,
        vision: false,
        tools: true,
        parallelTools: true,
        thinking: false
      },
      reasoning: {
        type: 'none'
      },
      contextWindow: 64000,
      source: {
        harness: 'system-simulator',
        provider: 'System Local'
      }
    }
  ];
}

/**
 * Query the host system for all available harnesses and their respective models.
 */
export async function initializeHarnessesAndModels(forceRefresh = false) {
  if (isInitialized && !forceRefresh) {
    return { harnesses: detectedHarnesses, models: availableModels };
  }

  console.log('🔍 [HarnessRegistry] Scanning system for available AI harnesses...');
  const harnesses = [];
  const models = [];

  // 1. Detect Antigravity CLI (agy)
  const agyBin = findHarnessBinary('agy') || findHarnessBinary('antigravity');
  if (agyBin) {
    console.log(`  ✓ Found Antigravity CLI (agy) harness at: ${agyBin}`);
    const agyModels = discoverAntigravityModels(agyBin);
    harnesses.push({
      id: 'antigravity',
      name: 'Antigravity CLI (agy)',
      status: 'active',
      binaryPath: agyBin,
      modelCount: agyModels.length
    });
    models.push(...agyModels);
  }

  // 2. Detect OpenCode
  const opencodeBin = findHarnessBinary('opencode');
  if (opencodeBin) {
    console.log(`  ✓ Found OpenCode harness at: ${opencodeBin}`);
    const ocModels = discoverOpencodeModels(opencodeBin);
    harnesses.push({
      id: 'opencode',
      name: 'OpenCode',
      status: 'active',
      binaryPath: opencodeBin,
      modelCount: ocModels.length
    });
    models.push(...ocModels);
  }

  // 2. Detect Ollama
  const ollamaBin = findHarnessBinary('ollama');
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const ollamaEndpointStatus = await checkHttpEndpoint(`${ollamaHost}/api/tags`, 800);
  if (ollamaBin || ollamaEndpointStatus.ok) {
    console.log(`  ✓ Found Ollama harness (binary: ${ollamaBin || 'none'}, endpoint: ${ollamaHost})`);
    const olModels = await discoverOllamaModels(ollamaBin, ollamaHost);
    harnesses.push({
      id: 'ollama',
      name: 'Ollama Local LLM',
      status: 'active',
      binaryPath: ollamaBin || ollamaHost,
      modelCount: olModels.length
    });
    models.push(...olModels);
  }

  // 3. Detect Claude Code CLI
  const claudeBin = findHarnessBinary('claude') || findHarnessBinary('claude-code');
  if (claudeBin || process.env.ANTHROPIC_API_KEY) {
    console.log(`  ✓ Found Claude Code harness at: ${claudeBin || 'API Key'}`);
    const claudeModels = discoverClaudeCodeModels(claudeBin);
    harnesses.push({
      id: 'claude-code',
      name: 'Claude Code',
      status: 'active',
      binaryPath: claudeBin || 'ANTHROPIC_API_KEY',
      modelCount: claudeModels.length
    });
    models.push(...claudeModels);
  }

  // 4. Detect Gemini CLI
  const geminiBin = findHarnessBinary('gemini') || findHarnessBinary('gemini-cli');
  if (geminiBin || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    console.log(`  ✓ Found Gemini CLI harness at: ${geminiBin || 'API Key'}`);
    const gemModels = discoverGeminiModels(geminiBin);
    harnesses.push({
      id: 'gemini',
      name: 'Gemini CLI',
      status: 'active',
      binaryPath: geminiBin || 'GEMINI_API_KEY',
      modelCount: gemModels.length
    });
    models.push(...gemModels);
  }

  // 5. Detect Codex / OpenAI CLI
  const codexBin = findHarnessBinary('codex') || findHarnessBinary('openai');
  if (codexBin || process.env.OPENAI_API_KEY) {
    console.log(`  ✓ Found Codex harness at: ${codexBin || 'API Key'}`);
    const codexModels = discoverCodexModels(codexBin);
    harnesses.push({
      id: 'codex',
      name: 'Codex / OpenAI',
      status: 'active',
      binaryPath: codexBin || 'OPENAI_API_KEY',
      modelCount: codexModels.length
    });
    models.push(...codexModels);
  }

  // Deduplicate models by ID
  const seenIds = new Set();
  const uniqueModels = [];
  for (const m of models) {
    if (!seenIds.has(m.id)) {
      seenIds.add(m.id);
      uniqueModels.push(m);
    }
  }

  // If host system has zero AI harnesses installed, provide fallback simulation harness
  if (uniqueModels.length === 0) {
    console.log('  ℹ No external AI harnesses detected. Initializing Virtual Simulation Harness.');
    const simModels = getSystemSimulatorModels();
    harnesses.push({
      id: 'system-simulator',
      name: 'Virtual Simulation Harness',
      status: 'fallback',
      binaryPath: 'internal://simulator',
      modelCount: simModels.length
    });
    uniqueModels.push(...simModels);
  }

  detectedHarnesses = harnesses;
  availableModels = uniqueModels;
  isInitialized = true;

  console.log(`✨ [HarnessRegistry] Discovery complete: ${detectedHarnesses.length} harness(es), ${availableModels.length} model(s) available.`);
  return { harnesses: detectedHarnesses, models: availableModels };
}

/**
 * Get all currently discovered models.
 */
export function getAvailableModels() {
  return availableModels;
}

/**
 * Get all detected harnesses.
 */
export function getDetectedHarnesses() {
  return detectedHarnesses;
}

/**
 * Find a specific ModelCapability by ID.
 */
export function getModelById(modelId) {
  if (!modelId) return null;
  return availableModels.find(m => m.id === modelId || m.id.endsWith(`/${modelId}`)) || null;
}

/**
 * Select the most capable or suitable model for a given agent role from discovered system models.
 * Matches agent role requirements (e.g. executive reasoning vs fast coding vs vision).
 */
export function selectBestModelForRole(role, preferredModelId = null) {
  if (availableModels.length === 0) {
    return null;
  }

  // If preferred model is available, use it
  if (preferredModelId) {
    const direct = getModelById(preferredModelId);
    if (direct) return direct;
  }

  const r = (role || '').toLowerCase();

  // 1. Roles requiring Deep Reasoning / Thinking (Executive, Architecture, Analysis, Security)
  if (r.includes('ceo') || r.includes('architect') || r.includes('wizard') || r.includes('analyst') || r.includes('diviner') || r.includes('lich')) {
    const thinkingModel = availableModels.find(m => m.capabilities.extendedThinking || m.capabilities.thinking);
    if (thinkingModel) return thinkingModel;
    const proModel = availableModels.find(m => m.id.includes('pro') || m.id.includes('sonnet') || m.id.includes('r1'));
    if (proModel) return proModel;
  }

  // 2. Roles requiring Vision / UI / CSS Layouts (Frontend Sorcerer, Designers)
  if (r.includes('frontend') || r.includes('sorcerer') || r.includes('design') || r.includes('sculptor')) {
    const visionModel = availableModels.find(m => m.capabilities.vision && m.capabilities.tools);
    if (visionModel) return visionModel;
  }

  // 3. Fast / High-throughput engineering & QA roles (Backend Cleric, QA Rogue, DevOps, Interns)
  if (r.includes('backend') || r.includes('cleric') || r.includes('qa') || r.includes('rogue') || r.includes('devops') || r.includes('warmage') || r.includes('intern')) {
    const flashOrToolModel = availableModels.find(m => (m.id.includes('flash') || m.id.includes('coder') || m.id.includes('haiku')) && m.capabilities.tools);
    if (flashOrToolModel) return flashOrToolModel;
  }

  // 4. General tool-capable model
  const toolModel = availableModels.find(m => m.capabilities.tools && !m.id.includes('tts') && !m.id.includes('clip'));
  if (toolModel) return toolModel;

  // Fallback to first available model
  return availableModels[0];
}
