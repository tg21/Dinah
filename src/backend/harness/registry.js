import { checkHttpEndpoint, findHarnessBinary } from './common.js';
import {
  getAvailableModels,
  getDetectedHarnesses,
  isRegistryInitialized,
  setRegistry
} from './store.js';
import { discoverAntigravityModels } from './providers/antigravity.js';
import { discoverOpencodeModels } from './providers/opencode.js';
import { discoverOllamaModels } from './providers/ollama.js';
import { discoverClaudeCodeModels } from './providers/claude.js';
import { discoverGeminiModels } from './providers/gemini.js';
import { discoverCodexModels } from './providers/codex.js';
import { discoverCopilotModels } from './providers/copilot.js';
import { getSystemSimulatorModels } from './providers/simulator.js';

/**
 * Query the host system for all available harnesses and their respective models.
 */
export async function initializeHarnessesAndModels(forceRefresh = false) {
  if (isRegistryInitialized() && !forceRefresh) {
    return { harnesses: getDetectedHarnesses(), models: getAvailableModels() };
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

  // 6. Detect GitHub Copilot CLI
  const copilotBin = findHarnessBinary('copilot');
  if (copilotBin) {
    console.log(`  ✓ Found GitHub Copilot CLI harness at: ${copilotBin}`);
    const copilotModels = discoverCopilotModels(copilotBin);
    harnesses.push({
      id: 'copilot',
      name: 'GitHub Copilot CLI',
      status: 'active',
      binaryPath: copilotBin,
      modelCount: copilotModels.length
    });
    models.push(...copilotModels);
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

  setRegistry(harnesses, uniqueModels);

  console.log(`✨ [HarnessRegistry] Discovery complete: ${getDetectedHarnesses().length} harness(es), ${getAvailableModels().length} model(s) available.`);
  return { harnesses: getDetectedHarnesses(), models: getAvailableModels() };
}
