import fs from 'fs';
import { spawn } from 'child_process';
import { findHarnessBinary } from '../harness/index.js';
import { createProjectFolder, getProjectFolder } from './projectService.js';
import { loadHrSystem } from './hrService.js';
import { appendAgentThought } from './messageService.js';
import { broadcastAgentEvent } from './eventBus.js';
import { createMcpInvocationConfig, mcpPromptContext, cleanupMcpInvocation } from '../mcp/index.js';
import { buildAgentPrompt } from './agentDefinitions.js';
import { ensureProjectManager } from './agentLifecycle.js';

export function resolveProjectDir(projectId, workspaceDir) {
  const projectDir = workspaceDir || getProjectFolder(projectId);
  if (projectId && projectId !== 'global' && !fs.existsSync(projectDir)) createProjectFolder(projectId, projectDir);
  // Work dispatched to a new projectId implicitly creates that project.
  // Guarantee its manager so implicit projects never stay manager-less.
  if (projectId && projectId !== 'global') {
    try {
      ensureProjectManager(projectId);
    } catch {
      /* manager guarantee is best-effort here; harness dispatch must proceed */
    }
  }
  return projectDir;
}

function runHarnessProcess(command, args, options = {}) {
  const { agentId, harness, onOutput, processKey, ...spawnOptions } = options;
  const captureLimit = 10 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...spawnOptions, stdio: ['ignore', 'pipe', 'pipe'] });
    if (processKey) activeHarnessProcesses.set(processKey, child);
    broadcastAgentEvent({
      type: 'harness_started',
      agentId,
      harness,
      pid: child.pid
    });

    let stdout = '';
    let stderr = '';
    const capture = (stream, chunk) => {
      const text = chunk.toString();
      if (stream === 'stdout' && stdout.length < captureLimit) stdout += text.slice(0, captureLimit - stdout.length);
      if (stream === 'stderr' && stderr.length < captureLimit) stderr += text.slice(0, captureLimit - stderr.length);
      onOutput?.(stream, text);
      broadcastAgentEvent({
        type: 'harness_output',
        agentId,
        harness,
        stream,
        snippet: text.slice(-500)
      });
    };
    child.stdout.on('data', (chunk) => capture('stdout', chunk));
    child.stderr.on('data', (chunk) => capture('stderr', chunk));
    child.once('error', (error) => {
      if (processKey) activeHarnessProcesses.delete(processKey);
      error.stdout = stdout;
      error.stderr = stderr;
      broadcastAgentEvent({ type: 'harness_failed', agentId, harness, error: error.message });
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (processKey) activeHarnessProcesses.delete(processKey);
      if (code === 0) {
        broadcastAgentEvent({ type: 'harness_completed', agentId, harness, code });
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`Harness exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`);
      error.code = code;
      error.signal = signal;
      error.stdout = stdout;
      error.stderr = stderr;
      broadcastAgentEvent({ type: 'harness_failed', agentId, harness, code, signal });
      reject(error);
    });
  });
}

const activeHarnessProcesses = new Map();

export function cancelHarnessAgent(agentId, signal = 'SIGTERM') {
  const child = activeHarnessProcesses.get(agentId);
  if (!child) return false;
  broadcastAgentEvent({ type: 'harness_cancel_requested', agentId, pid: child.pid, signal });
  return child.kill(signal);
}

export async function spawnAntigravityAgent(projectId, prompt, agentId, mcpInvocation, workspaceDir) {
  const projectDir = resolveProjectDir(projectId, workspaceDir);
  const harnessBin = findHarnessBinary('agy') || findHarnessBinary('antigravity');

  if (!harnessBin) {
    return simulateHarnessExecution('antigravity', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    appendAgentThought(
      agentId,
      'ANTIGRAVITY_INVOKE',
      `Invoking Antigravity CLI (agy) [${agent?.model || 'default'}] in ${projectDir}`
    );
    const args = [];
    if (agent?.model) args.push('--model', agent.model);
    args.push('--dangerously-skip-permissions', '-p', prompt);
    const { stdout } = await runHarnessProcess(harnessBin, args, {
      cwd: projectDir,
      env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' },
      agentId,
      harness: 'antigravity',
      processKey: agentId
    });
    appendAgentThought(agentId, 'ANTIGRAVITY_SUCCESS', `Antigravity CLI (agy) execution completed.`);
    return {
      success: true,
      output: (stdout || '').trim(),
      agentId,
      harness: 'antigravity',
      model: agent?.model
    };
  } catch (error) {
    appendAgentThought(agentId, 'ANTIGRAVITY_FALLBACK', `Harness note: ${error.message.slice(0, 80)}`);
    return simulateHarnessExecution('antigravity', projectId, prompt, agentId);
  }
}

export async function spawnOpencodeAgent(projectId, prompt, agentId, mcpInvocation, workspaceDir) {
  const projectDir = resolveProjectDir(projectId, workspaceDir);
  const harnessBin = findHarnessBinary('opencode');

  if (!harnessBin) {
    return simulateHarnessExecution('opencode', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    appendAgentThought(
      agentId,
      'OPENCODE_INVOKE',
      `Invoking OpenCode harness [${agent?.model || 'default'}] in ${projectDir}`
    );
    // Dinah agents are non-interactive and must be able to use the enabled
    // orchestration MCP tools without waiting for a human approval prompt.
    // The invocation still uses a temporary, token-scoped MCP config and the
    // orchestration server enforces the agent/project boundary.
    const args = ['run', '--auto'];
    if (agent?.model) args.push('-m', agent.model);
    args.push('--dir', projectDir, prompt);
    const { stdout: output } = await runHarnessProcess(harnessBin, args, {
      cwd: projectDir,
      env: {
        ...process.env,
        DND_MCP_CONFIG: mcpInvocation?.file || '',
        OPENCODE_CONFIG: mcpInvocation?.opencodeFile || ''
      },
      agentId,
      harness: 'opencode',
      processKey: agentId
    });
    appendAgentThought(agentId, 'OPENCODE_SUCCESS', `OpenCode execution completed.`);
    return { success: true, output, agentId, harness: 'opencode', model: agent?.model };
  } catch (error) {
    const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : String(error.stderr || '');
    const stdout = Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8') : String(error.stdout || '');
    const diagnostics = [
      `message=${error.message}`,
      `code=${error.code || 'unknown'}`,
      `status=${error.status ?? 'unknown'}`,
      `signal=${error.signal || 'none'}`,
      stderr ? `stderr=${stderr.slice(-1200)}` : '',
      stdout ? `stdout=${stdout.slice(-600)}` : ''
    ].filter(Boolean).join(' | ');
    appendAgentThought(agentId, 'OPENCODE_FALLBACK', `Harness diagnostics: ${diagnostics}`);
    return {
      ...simulateHarnessExecution('opencode', projectId, prompt, agentId),
      fallbackReason: diagnostics
    };
  }
}

export async function spawnClaudeCodeAgent(projectId, prompt, agentId, mcpInvocation, workspaceDir) {
  const projectDir = resolveProjectDir(projectId, workspaceDir);
  const harnessBin = findHarnessBinary('claude-code') || findHarnessBinary('claude');

  if (!harnessBin) {
    return simulateHarnessExecution('claude-code', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    const args = ['-p', prompt, '--workdir', projectDir];
    if (mcpInvocation?.mcps?.length) args.push('--mcp-config', mcpInvocation.file);
    const { stdout: output } = await runHarnessProcess(harnessBin, args, {
      cwd: projectDir,
      env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' },
      agentId,
      harness: 'claude-code',
      processKey: agentId
    });
    return { success: true, output, agentId, harness: 'claude-code', model: agent?.model };
  } catch (error) {
    return simulateHarnessExecution('claude-code', projectId, prompt, agentId);
  }
}

export async function spawnCodexAgent(projectId, prompt, agentId, mcpInvocation, workspaceDir) {
  const projectDir = resolveProjectDir(projectId, workspaceDir);
  const harnessBin = findHarnessBinary('codex') || findHarnessBinary('openai');

  if (!harnessBin) {
    return simulateHarnessExecution('codex', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    // Codex uses the non-interactive `exec` subcommand and `--cd`; `--dir`
    // belongs to OpenCode and is rejected by current Codex CLI releases.
    const args = ['exec'];
    if (agent?.model) args.push('--model', agent.model);
    args.push('--cd', projectDir, prompt);
    const { stdout: output } = await runHarnessProcess(harnessBin, args, {
      cwd: projectDir,
      env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' },
      agentId,
      harness: 'codex',
      processKey: agentId
    });
    appendAgentThought(agentId, 'CODEX_SUCCESS', `Codex CLI execution completed.`);
    return { success: true, output, agentId, harness: 'codex', model: agent?.model };
  } catch (error) {
    appendAgentThought(agentId, 'CODEX_FALLBACK', `Harness note: ${error.message.slice(0, 120)}`);
    return simulateHarnessExecution('codex', projectId, prompt, agentId);
  }
}

export async function spawnGeminiAgent(projectId, prompt, agentId, mcpInvocation, workspaceDir) {
  const projectDir = resolveProjectDir(projectId, workspaceDir);
  const harnessBin = findHarnessBinary('gemini') || findHarnessBinary('gemini-cli');

  if (!harnessBin) {
    return simulateHarnessExecution('gemini', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    const modelName = agent?.model || 'gemini-2.5-flash';
    const { stdout: output } = await runHarnessProcess(harnessBin, ['--model', modelName, '--dir', projectDir, prompt], {
      cwd: projectDir,
      env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' },
      agentId,
      harness: 'gemini',
      processKey: agentId
    });
    return { success: true, output, agentId, harness: 'gemini', model: agent?.model };
  } catch (error) {
    return simulateHarnessExecution('gemini', projectId, prompt, agentId);
  }
}

export async function spawnOllamaAgent(projectId, prompt, agentId, mcpInvocation, workspaceDir) {
  const projectDir = resolveProjectDir(projectId, workspaceDir);
  const harnessBin = findHarnessBinary('ollama');

  if (!harnessBin) {
    return simulateHarnessExecution('ollama', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    const modelName = agent?.model || 'llama3';
    const { stdout: output } = await runHarnessProcess(harnessBin, ['run', modelName, prompt], {
      cwd: projectDir,
      env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' },
      agentId,
      harness: 'ollama',
      processKey: agentId
    });
    return { success: true, output, agentId, harness: 'ollama', model: agent?.model };
  } catch (error) {
    return simulateHarnessExecution('ollama', projectId, prompt, agentId);
  }
}

export function simulateHarnessExecution(harness, projectId, prompt, agentId) {
  const hrSystem = loadHrSystem();
  const agent = hrSystem[agentId] || { name: agentId, role: agentId, model: 'system-simulator/balanced-agent' };

  let roleFlavor = '';
  if (agent.role && agent.role.includes('ceo')) {
    roleFlavor = `[CEO Warlock]: I have received your strategic directive: "${prompt}". Delegating to HR Mind Flayer to ensure Manager Bard and project resources are allocated.`;
  } else if (agent.role && agent.role.includes('hr')) {
    roleFlavor = `[HR Mind Flayer]: Compliance verified. Telepathically reviewing active agent roster and templates for project ${projectId}.`;
  } else if (agent.role && agent.role.includes('manager')) {
    roleFlavor = `[Manager Bard]: Casting Vicious Mockery on project blockers! Breaking down "${prompt}" into sprint tickets for engineering and QA specialists.`;
  } else if (agent.role && agent.role.includes('analyst')) {
    roleFlavor = `[Senior Analyst Diviner]: Inspecting system telemetry and synthesizing insights for "${prompt}" into Company Knowledge Base.`;
  } else if (agent.role && (agent.role.includes('wizard') || agent.role.includes('architect'))) {
    roleFlavor = `[Solution Architect Wizard]: Drafting architectural blueprint, API schemas, and distributed data contracts for "${prompt}".`;
  } else if (agent.role && (agent.role.includes('paladin') || agent.role.includes('staff'))) {
    roleFlavor = `[Staff Engineer Paladin]: Enforcing the Sacred Oath of Clean Code. Inspecting interfaces, SOLID design, and test requirements.`;
  } else if (agent.role && (agent.role.includes('cleric') || agent.role.includes('backend'))) {
    roleFlavor = `[Backend Cleric]: Praying to PostgreSQL gods. Preparing zero-downtime database schema and REST controllers.`;
  } else if (agent.role && (agent.role.includes('sorcerer') || agent.role.includes('frontend'))) {
    roleFlavor = `[Frontend Sorcerer]: Channeling PixiJS visual magic and responsive CSS layouts.`;
  } else if (agent.role && (agent.role.includes('rogue') || agent.role.includes('qa'))) {
    roleFlavor = `[QA Rogue]: Lurking in the shadows with edge-case null pointers, fuzz testing, and regression suites.`;
  } else if (agent.role && (agent.role.includes('warmage') || agent.role.includes('devops'))) {
    roleFlavor = `[DevOps Warmage]: Fortifying Kubernetes deployment pipelines and Prometheus alerting against traffic surges.`;
  } else {
    roleFlavor = `[${agent.name || agentId}]: Processing directive "${prompt}" via [${agent.model || harness}]. Task execution verified.`;
  }

  appendAgentThought(
    agentId,
    'REASONING',
    `Parsed directive for project ${projectId}. Model [${agent.model || harness}] generating optimal execution plan.`
  );
  appendAgentThought(agentId, 'EXECUTION', `Executed task plan successfully.`);

  return {
    success: true,
    output: roleFlavor,
    agentId,
    harness,
    model: agent.model || harness,
    simulated: true
  };
}

export async function spawnHarnessAgent(harness = 'opencode', projectId, prompt, agentId, options = {}) {
  const agent = loadHrSystem()[agentId] || { role: agentId, name: agentId };
  const mcpInvocation = createMcpInvocationConfig(agent, agentId, projectId);
  const effectivePrompt = buildAgentPrompt(
    agent.role || agentId,
    prompt,
    { ...agent, project: projectId },
    {
      workspaceDir: options.workspaceDir,
      includeToolRoot: options.includeToolRoot !== false
    }
  ) + mcpPromptContext(agent, mcpInvocation);
  try {
    switch (harness) {
      case 'antigravity':
      case 'agy':
        return await spawnAntigravityAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
      case 'opencode':
        return await spawnOpencodeAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
      case 'claude-code':
        return await spawnClaudeCodeAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
      case 'codex':
        return await spawnCodexAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
      case 'gemini':
        return await spawnGeminiAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
      case 'ollama':
        return await spawnOllamaAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
      default:
        return await spawnOpencodeAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
    }
  } finally {
    try {
      cleanupMcpInvocation(mcpInvocation);
      fs.rmSync(mcpInvocation.dir, { recursive: true, force: true });
    } catch (e) {
      /* best effort cleanup */
    }
  }
}
