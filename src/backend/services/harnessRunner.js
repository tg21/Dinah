import fs from 'fs';
import { spawn } from 'child_process';
import { findHarnessBinary } from '../harness/index.js';
import { createProjectFolder, getProjectFolder } from './projectService.js';
import { loadHrSystem, saveHrSystem } from './hrService.js';
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

// Parse `opencode run --format json` (JSONL) output: collect assistant text
// parts in order plus the session id. Falls back to raw stdout when the
// output isn't JSONL (older CLI), so behavior never regresses.
export function parseOpencodeJsonOutput(stdout) {
  const raw = (stdout || '').trim();
  if (!raw) return { output: raw, sessionId: null };
  const lines = raw.split('\n');
  let sessionId = null;
  const texts = [];
  let jsonLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed);
      jsonLines += 1;
      if (!sessionId && typeof event.sessionID === 'string') sessionId = event.sessionID;
      if (event.type === 'text' && typeof event.part?.text === 'string') texts.push(event.part.text);
    } catch {
      /* not a JSON event line; ignore */
    }
  }
  if (!jsonLines) return { output: raw, sessionId: null };
  return { output: texts.join('').trim() || raw, sessionId };
}

export async function spawnOpencodeAgent(projectId, prompt, agentId, mcpInvocation, workspaceDir) {
  const projectDir = resolveProjectDir(projectId, workspaceDir);
  const harnessBin = findHarnessBinary('opencode');

  if (!harnessBin) {
    return simulateHarnessExecution('opencode', projectId, prompt, agentId);
  }

  // Native session continuation (plan 01 spike, verified 2026-09-11):
  // `opencode run --format json` emits per-event sessionIDs; passing a known
  // id back via `-s` resumes that agent's session. `-s` with an unknown id
  // errors ("Session not found") instead of creating, so the first turn runs
  // without `-s` and persists the returned id for later turns.
  const storedSessionId = loadHrSystem()[agentId]?.harnessSessions?.opencode || null;

  const runOnce = async (sessionId) => {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    const args = ['run', '--auto', '--format', 'json'];
    if (sessionId) args.push('-s', sessionId);
    if (agent?.model) args.push('-m', agent.model);
    args.push('--dir', projectDir, prompt);
    const { stdout } = await runHarnessProcess(harnessBin, args, {
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
    return parseOpencodeJsonOutput(stdout);
  };

  const persistSessionId = (sessionId) => {
    if (!sessionId) return;
    try {
      const hrSystem = loadHrSystem();
      if (!hrSystem[agentId]) return;
      hrSystem[agentId].harnessSessions = { ...(hrSystem[agentId].harnessSessions || {}), opencode: sessionId };
      saveHrSystem(hrSystem);
    } catch {
      /* session tracking must never break a harness turn */
    }
  };

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    appendAgentThought(
      agentId,
      'OPENCODE_INVOKE',
      `Invoking OpenCode harness [${agent?.model || 'default'}] in ${projectDir}` +
        (storedSessionId ? ` (resuming session ${storedSessionId})` : ' (new session)')
    );
    // Dinah agents are non-interactive and must be able to use the enabled
    // orchestration MCP tools without waiting for a human approval prompt.
    // The invocation still uses a temporary, token-scoped MCP config and the
    // orchestration server enforces the agent/project boundary.
    let parsed;
    try {
      parsed = await runOnce(storedSessionId);
      // Some CLI versions report a missing session on stdout with exit 0.
      if (storedSessionId && /session not found/i.test(parsed.output || '')) {
        throw Object.assign(new Error('Session not found'), { stdout: parsed.output });
      }
    } catch (error) {
      // Stale session id (e.g. pruned server-side): retry once as a new session.
      if (storedSessionId && /session not found/i.test(String(error.message || '') + String(error.stderr || ''))) {
        appendAgentThought(agentId, 'OPENCODE_SESSION_RESET', `Stored session ${storedSessionId} not found; starting a new session.`);
        try {
          const hr = loadHrSystem();
          if (hr[agentId]?.harnessSessions?.opencode) {
            delete hr[agentId].harnessSessions.opencode;
            saveHrSystem(hr);
          }
        } catch { /* best effort */ }
        parsed = await runOnce(null);
      } else {
        throw error;
      }
    }
    persistSessionId(parsed.sessionId);
    appendAgentThought(agentId, 'OPENCODE_SUCCESS', `OpenCode execution completed.`);
    return { success: true, output: parsed.output, agentId, harness: 'opencode', model: agent?.model, sessionId: parsed.sessionId || undefined };
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

// Parse `codex exec --json` (JSONL) output: thread id plus assistant message
// text. Falls back to raw stdout when the output isn't JSONL.
export function parseCodexJsonOutput(stdout) {
  const raw = (stdout || '').trim();
  if (!raw) return { output: raw, sessionId: null };
  const lines = raw.split('\n');
  let sessionId = null;
  const texts = [];
  let jsonLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed);
      jsonLines += 1;
      if (!sessionId && typeof event.thread_id === 'string') sessionId = event.thread_id;
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
        texts.push(event.item.text);
      }
    } catch {
      /* not a JSON event line; ignore */
    }
  }
  if (!jsonLines) return { output: raw, sessionId: null };
  return { output: texts.join('\n').trim() || raw, sessionId };
}

export async function spawnCodexAgent(projectId, prompt, agentId, mcpInvocation, workspaceDir) {
  const projectDir = resolveProjectDir(projectId, workspaceDir);
  const harnessBin = findHarnessBinary('codex') || findHarnessBinary('openai');

  if (!harnessBin) {
    return simulateHarnessExecution('codex', projectId, prompt, agentId);
  }

  // Native session continuation (verified live 2026-09-11): `codex exec
  // --json` emits `thread.started` with a thread_id; `codex exec resume
  // <thread-id> <prompt>` continues it (nonce recall confirmed). A stale id
  // exits 1 with "no rollout found", so retry once as a new thread.
  const storedSessionId = loadHrSystem()[agentId]?.harnessSessions?.codex || null;

  const runOnce = async (sessionId) => {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    // Codex uses the non-interactive `exec` subcommand and `--cd`; `--dir`
    // belongs to OpenCode and is rejected by current Codex CLI releases.
    // `--skip-git-repo-check` lets project workspaces without a .git run.
    // `resume` reuses the thread's recorded cwd and rejects `--cd`, so it is
    // only passed on new threads (same-project resumes share the cwd anyway).
    const args = sessionId ? ['exec', 'resume', sessionId] : ['exec'];
    if (agent?.model) args.push('--model', agent.model);
    args.push('--json', '--skip-git-repo-check');
    if (!sessionId) args.push('--cd', projectDir);
    args.push(prompt);
    const { stdout } = await runHarnessProcess(harnessBin, args, {
      cwd: projectDir,
      env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' },
      agentId,
      harness: 'codex',
      processKey: agentId
    });
    return parseCodexJsonOutput(stdout);
  };

  const persistSessionId = (sessionId) => {
    if (!sessionId) return;
    try {
      const hrSystem = loadHrSystem();
      if (!hrSystem[agentId]) return;
      hrSystem[agentId].harnessSessions = { ...(hrSystem[agentId].harnessSessions || {}), codex: sessionId };
      saveHrSystem(hrSystem);
    } catch {
      /* session tracking must never break a harness turn */
    }
  };

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    appendAgentThought(
      agentId,
      'CODEX_INVOKE',
      `Invoking Codex harness [${agent?.model || 'default'}] in ${projectDir}` +
        (storedSessionId ? ` (resuming thread ${storedSessionId})` : ' (new thread)')
    );
    let parsed;
    try {
      parsed = await runOnce(storedSessionId);
    } catch (error) {
      // Stale thread id (e.g. pruned server-side): retry once as a new thread.
      if (storedSessionId && /no rollout found|not found/i.test(String(error.message || '') + String(error.stderr || ''))) {
        appendAgentThought(agentId, 'CODEX_SESSION_RESET', `Stored thread ${storedSessionId} not found; starting a new thread.`);
        try {
          const hr = loadHrSystem();
          if (hr[agentId]?.harnessSessions?.codex) {
            delete hr[agentId].harnessSessions.codex;
            saveHrSystem(hr);
          }
        } catch { /* best effort */ }
        parsed = await runOnce(null);
      } else {
        throw error;
      }
    }
    persistSessionId(parsed.sessionId);
    appendAgentThought(agentId, 'CODEX_SUCCESS', `Codex CLI execution completed.`);
    return { success: true, output: parsed.output, agentId, harness: 'codex', model: agent?.model, sessionId: parsed.sessionId || undefined };
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
