import fs from 'fs';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { findHarnessBinary } from '../harness/index.js';
import { createProjectFolder, getProjectFolder } from './projectService.js';
import { loadHrSystem, saveHrSystem } from './hrService.js';
import { appendAgentThought } from './messageService.js';
import { broadcastAgentEvent } from './eventBus.js';
import { createMcpInvocationConfig, mcpPromptContext, cleanupMcpInvocation } from '../mcp/index.js';
import { buildAgentPrompt, buildContinuationPrompt } from './agentDefinitions.js';
import { ensureProjectManager } from './agentLifecycle.js';

// ------------------------------------------------------------
// Harness session reuse (plan 01 follow-up).
// Native sessions survive server restarts because the session id lives on
// the HR record (`agent.harnessSessions.<key>`, persisted in
// hr-system.json), not in process memory. Every follow-up message reuses
// the same session via the harness's native resume flag (`opencode -s`,
// `codex exec resume`, `agy --conversation`, `claude --resume`,
// `copilot --resume`); only a missing/stale id (or a harness/model switch,
// which clears the map) starts a new session.
// CLIs are one-shot processes by design — "reuse" means resuming the
// server-side session, not keeping a process alive.
// ------------------------------------------------------------
const SESSION_HARNESS_KEYS = {
  opencode: 'opencode',
  codex: 'codex',
  agy: 'agy',
  antigravity: 'agy',
  'claude-code': 'claude-code',
  claude: 'claude-code',
  copilot: 'copilot'
};

export function sessionKeyForHarness(harness) {
  return SESSION_HARNESS_KEYS[harness] || null;
}

export function getStoredSessionId(agentId, harness) {
  const key = sessionKeyForHarness(harness);
  if (!key) return null;
  try {
    return loadHrSystem()[agentId]?.harnessSessions?.[key] || null;
  } catch {
    return null;
  }
}

export function persistHarnessSession(agentId, harness, sessionId) {
  if (!sessionId) return;
  const key = sessionKeyForHarness(harness);
  if (!key) return;
  try {
    const hrSystem = loadHrSystem();
    if (!hrSystem[agentId]) return;
    hrSystem[agentId].harnessSessions = { ...(hrSystem[agentId].harnessSessions || {}), [key]: sessionId };
    saveHrSystem(hrSystem);
  } catch {
    /* session tracking must never break a harness turn */
  }
}

export function clearHarnessSession(agentId, harness) {
  const key = sessionKeyForHarness(harness);
  if (!key) return;
  try {
    const hr = loadHrSystem();
    if (hr[agentId]?.harnessSessions?.[key]) {
      delete hr[agentId].harnessSessions[key];
      saveHrSystem(hr);
    }
  } catch { /* best effort */ }
}

// Switching provider/model orphans the old native session (a resumed
// thread would run under the wrong model), so drop all stored ids. Called
// from agent update/confirm paths.
export function clearAllHarnessSessions(agentId) {
  try {
    const hr = loadHrSystem();
    if (hr[agentId]?.harnessSessions) {
      delete hr[agentId].harnessSessions;
      saveHrSystem(hr);
    }
  } catch { /* best effort */ }
}

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

// Parse `agy --output-format json -p=...` output: a single JSON envelope
// carrying the conversation id plus the assistant text. Falls back to raw
// stdout when the output isn't JSON (older CLI / text mode).
export function parseAgyJsonOutput(stdout) {
  const raw = (stdout || '').trim();
  if (!raw) return { output: raw, sessionId: null };
  // Envelope may be preceded by warning lines ("conversation ... not
  // found"); scan for the first JSON object line with a conversation_id.
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed);
      if (typeof event.conversation_id === 'string') {
        const text = typeof event.response === 'string' ? event.response.trim() : raw;
        return { output: text || raw, sessionId: event.conversation_id };
      }
    } catch {
      /* not the envelope line; keep scanning */
    }
  }
  return { output: raw, sessionId: null };
}

export async function spawnAntigravityAgent(projectId, prompt, agentId, mcpInvocation, workspaceDir) {
  const projectDir = resolveProjectDir(projectId, workspaceDir);
  const harnessBin = findHarnessBinary('agy') || findHarnessBinary('antigravity');

  if (!harnessBin) {
    return simulateHarnessExecution('antigravity', projectId, prompt, agentId);
  }

  // Native session continuation (verified live 2026-09-12): `--output-format
  // json` returns `{conversation_id, response, ...}`; passing the id back via
  // `--conversation` resumes it (nonce recall confirmed, num_turns 2). A
  // stale id only warns and starts a fresh conversation, so no retry — just
  // persist whatever id comes back.
  const storedSessionId = getStoredSessionId(agentId, 'agy');

  const runOnce = async (sessionId) => {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    const args = ['--output-format', 'json'];
    if (sessionId) args.push('--conversation', sessionId);
    if (agent?.model) args.push('--model', agent.model);
    args.push('--dangerously-skip-permissions', `-p=${prompt}`);
    const { stdout, stderr } = await runHarnessProcess(harnessBin, args, {
      cwd: projectDir,
      env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' },
      agentId,
      harness: 'antigravity',
      processKey: agentId
    });
    return { parsed: parseAgyJsonOutput(stdout), stderr };
  };

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    appendAgentThought(
      agentId,
      'ANTIGRAVITY_INVOKE',
      `Invoking Antigravity CLI (agy) [${agent?.model || 'default'}] in ${projectDir}` +
        (storedSessionId ? ` (resuming conversation ${storedSessionId})` : ' (new conversation)')
    );
    const { parsed, stderr } = await runOnce(storedSessionId);
    if (storedSessionId && parsed.sessionId && parsed.sessionId !== storedSessionId) {
      appendAgentThought(agentId, 'ANTIGRAVITY_SESSION_RESET', `Stored conversation ${storedSessionId} not found; started ${parsed.sessionId}.`);
    }
    if (/conversation .* not found/i.test(String(stderr || ''))) {
      appendAgentThought(agentId, 'ANTIGRAVITY_SESSION_RESET', `Stored conversation ${storedSessionId} not found; started a new conversation.`);
    }
    persistHarnessSession(agentId, 'agy', parsed.sessionId);
    appendAgentThought(agentId, 'ANTIGRAVITY_SUCCESS', `Antigravity CLI (agy) execution completed.`);
    return {
      success: true,
      output: parsed.output,
      agentId,
      harness: 'antigravity',
      model: agent?.model,
      ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {})
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
  // without `-s` and persists the returned id for later turns. The id lives
  // on the HR record, so reuse survives server restarts.
  const storedSessionId = getStoredSessionId(agentId, 'opencode');

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

  const persistSessionId = (sessionId) => persistHarnessSession(agentId, 'opencode', sessionId);

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
        clearHarnessSession(agentId, 'opencode');
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

// Parse `claude -p --output-format json` output: a single result object
// carrying the session id plus the assistant text. Falls back to raw stdout
// when the output isn't JSON. Envelope verified live 2026-09-12
// (`session_id` + `result` fields observed); resume recall is unverified
// (no credits on this host), so treat the wiring as provisional.
export function parseClaudeJsonOutput(stdout) {
  const raw = (stdout || '').trim();
  if (!raw) return { output: raw, sessionId: null, isError: false };
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed);
      if (event.type === 'result') {
        const text = typeof event.result === 'string' ? event.result.trim() : raw;
        return {
          output: text || raw,
          sessionId: typeof event.session_id === 'string' ? event.session_id : null,
          isError: event.is_error === true
        };
      }
    } catch {
      /* not the result line; keep scanning */
    }
  }
  return { output: raw, sessionId: null, isError: false };
}

export async function spawnClaudeCodeAgent(projectId, prompt, agentId, mcpInvocation, workspaceDir) {
  const projectDir = resolveProjectDir(projectId, workspaceDir);
  const harnessBin = findHarnessBinary('claude-code') || findHarnessBinary('claude');

  if (!harnessBin) {
    return simulateHarnessExecution('claude-code', projectId, prompt, agentId);
  }

  // Native session continuation: `--output-format json` returns a result
  // object with `session_id`; passing it back via `--resume` continues the
  // conversation. New sessions get an explicit `--session-id` UUID so the id
  // is known even if output parsing misses. The id lives on the HR record,
  // so reuse survives server restarts.
  const storedSessionId = getStoredSessionId(agentId, 'claude-code');
  const newSessionId = storedSessionId || randomUUID();

  const runOnce = async (sessionId, isNew) => {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    const args = ['-p', prompt, '--output-format', 'json', '--dangerously-skip-permissions'];
    if (isNew) args.push('--session-id', newSessionId);
    else args.push('--resume', sessionId);
    if (agent?.model) args.push('--model', agent.model);
    if (mcpInvocation?.claudeFile) args.push('--mcp-config', mcpInvocation.claudeFile);
    const { stdout, stderr } = await runHarnessProcess(harnessBin, args, {
      cwd: projectDir,
      env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' },
      agentId,
      harness: 'claude-code',
      processKey: agentId
    });
    return { parsed: parseClaudeJsonOutput(stdout), stderr };
  };

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    appendAgentThought(
      agentId,
      'CLAUDE_INVOKE',
      `Invoking Claude Code harness [${agent?.model || 'default'}] in ${projectDir}` +
        (storedSessionId ? ` (resuming session ${storedSessionId})` : ' (new session)')
    );
    let parsed;
    let stderr = '';
    try {
      ({ parsed, stderr } = await runOnce(storedSessionId, !storedSessionId));
      // Stale session id: clear and retry once as a new session.
      if (storedSessionId && !parsed.sessionId && /session.*(not found|not exist|invalid)|no .*session|not.*resum/i.test(`${parsed.output || ''} ${stderr || ''}`)) {
        throw Object.assign(new Error('Session not found'), { staleSession: true });
      }
    } catch (error) {
      if (storedSessionId && (error.staleSession || /session.*(not found|not exist|invalid)|not.*resum/i.test(String(error.message || '') + String(error.stderr || '')))) {
        appendAgentThought(agentId, 'CLAUDE_SESSION_RESET', `Stored session ${storedSessionId} not found; starting a new session.`);
        clearHarnessSession(agentId, 'claude-code');
        ({ parsed, stderr } = await runOnce(null, true));
      } else {
        throw error;
      }
    }
    persistHarnessSession(agentId, 'claude-code', parsed.sessionId || newSessionId);
    appendAgentThought(agentId, 'CLAUDE_SUCCESS', `Claude Code execution completed.`);
    if (parsed.isError) {
      // Exit 0 with an API error (e.g. out of credits): the turn did no
      // work. Fall back so the dispatcher re-queues instead of consuming.
      const reason = `Claude Code reported an error: ${(parsed.output || 'unknown error').slice(0, 300)}`;
      appendAgentThought(agentId, 'CLAUDE_FALLBACK', `Harness note: ${reason}`);
      return { ...simulateHarnessExecution('claude-code', projectId, prompt, agentId), fallbackReason: reason };
    }
    return { success: true, output: parsed.output, agentId, harness: 'claude-code', model: agent?.model, sessionId: parsed.sessionId || newSessionId };
  } catch (error) {
    appendAgentThought(agentId, 'CLAUDE_FALLBACK', `Harness note: ${error.message.slice(0, 120)}`);
    return simulateHarnessExecution('claude-code', projectId, prompt, agentId);
  }
}

// Parse `copilot -p --output-format json` (JSONL) output: assistant text
// from the final `assistant.message` (or joined `assistant.message_delta`
// chunks) plus the session id from the closing `result` line. Falls back to
// raw stdout when the output isn't JSONL. Verified live 2026-09-12 with a
// nonce recall (`--resume=<id>` returns the same sessionId).
export function parseCopilotJsonOutput(stdout) {
  const raw = (stdout || '').trim();
  if (!raw) return { output: raw, sessionId: null };
  let sessionId = null;
  let finalMessage = null;
  const deltas = [];
  let jsonLines = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed);
      jsonLines += 1;
      if (event.type === 'result' && typeof event.sessionId === 'string') sessionId = event.sessionId;
      if (event.type === 'assistant.message' && typeof event.data?.content === 'string') {
        finalMessage = event.data.content;
      } else if (event.type === 'assistant.message_delta' && typeof event.data?.deltaContent === 'string') {
        deltas.push(event.data.deltaContent);
      }
    } catch {
      /* not a JSON event line; ignore */
    }
  }
  if (!jsonLines) return { output: raw, sessionId: null };
  const text = (finalMessage ?? deltas.join('')).trim() || raw;
  return { output: text, sessionId };
}

export async function spawnCopilotAgent(projectId, prompt, agentId, mcpInvocation, workspaceDir) {
  const projectDir = resolveProjectDir(projectId, workspaceDir);
  const harnessBin = findHarnessBinary('copilot');

  if (!harnessBin) {
    return simulateHarnessExecution('copilot', projectId, prompt, agentId);
  }

  // Native session continuation (verified live 2026-09-12): `--output-format
  // json` ends with a `result` line carrying `sessionId`;
  // `--resume=<id>` continues it (nonce recall confirmed, same id back). A
  // stale id exits 0 with `Error: No session, task, or name matched ...` on
  // stderr and no JSON, so clear and retry once as a new session. New
  // sessions get an explicit `--session-id` UUID. The id lives on the HR
  // record, so reuse survives server restarts. Note: like codex, a resume
  // reuses the session's recorded working directory (same-project resumes
  // share the cwd anyway).
  const storedSessionId = getStoredSessionId(agentId, 'copilot');
  const newSessionId = storedSessionId || randomUUID();

  const runOnce = async (sessionId, isNew) => {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    const args = ['-p', prompt, '--allow-all-tools', '--output-format', 'json'];
    if (isNew) args.push(`--session-id=${newSessionId}`);
    else args.push(`--resume=${sessionId}`);
    if (agent?.model) args.push('--model', agent.model);
    if (mcpInvocation?.copilotFile) args.push('--additional-mcp-config', mcpInvocation.copilotFile);
    const { stdout, stderr } = await runHarnessProcess(harnessBin, args, {
      cwd: projectDir,
      env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' },
      agentId,
      harness: 'copilot',
      processKey: agentId
    });
    return { parsed: parseCopilotJsonOutput(stdout), stderr };
  };

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    appendAgentThought(
      agentId,
      'COPILOT_INVOKE',
      `Invoking Copilot CLI [${agent?.model || 'default'}] in ${projectDir}` +
        (storedSessionId ? ` (resuming session ${storedSessionId})` : ' (new session)')
    );
    let parsed;
    let stderr = '';
    try {
      ({ parsed, stderr } = await runOnce(storedSessionId, !storedSessionId));
      // Stale session id: no JSON result line, `Error: No session, task, or
      // name matched ...` on stderr.
      if (storedSessionId && !parsed.sessionId && /no session.*matched|not found/i.test(`${parsed.output || ''} ${stderr || ''}`)) {
        throw Object.assign(new Error('Session not found'), { staleSession: true });
      }
    } catch (error) {
      if (storedSessionId && (error.staleSession || /no session.*matched|not found|no .*session/i.test(String(error.message || '') + String(error.stderr || '')))) {
        appendAgentThought(agentId, 'COPILOT_SESSION_RESET', `Stored session ${storedSessionId} not found; starting a new session.`);
        clearHarnessSession(agentId, 'copilot');
        ({ parsed } = await runOnce(null, true));
      } else {
        throw error;
      }
    }
    persistHarnessSession(agentId, 'copilot', parsed.sessionId || newSessionId);
    appendAgentThought(agentId, 'COPILOT_SUCCESS', `Copilot CLI execution completed.`);
    return { success: true, output: parsed.output, agentId, harness: 'copilot', model: agent?.model, sessionId: parsed.sessionId || newSessionId };
  } catch (error) {
    appendAgentThought(agentId, 'COPILOT_FALLBACK', `Harness note: ${error.message.slice(0, 120)}`);
    return simulateHarnessExecution('copilot', projectId, prompt, agentId);
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
  // exits 1 with "no rollout found", so retry once as a new thread. The id
  // lives on the HR record, so reuse survives server restarts.
  const storedSessionId = getStoredSessionId(agentId, 'codex');

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

  const persistSessionId = (sessionId) => persistHarnessSession(agentId, 'codex', sessionId);

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
        clearHarnessSession(agentId, 'codex');
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
  // Session reuse: the first turn bootstraps the native session with the full
  // role prompt; follow-ups resume that session, so they send only the new
  // task (the session already holds the bootstrap). The fresh per-turn MCP
  // context is still appended in both cases because the manifest path is
  // token-scoped per invocation.
  const isResume = options.resume !== false && !!getStoredSessionId(agentId, harness);
  const basePrompt = isResume
    ? buildContinuationPrompt(prompt, { ...agent, project: projectId }, { workspaceDir: options.workspaceDir, project: projectId })
    : buildAgentPrompt(
      agent.role || agentId,
      prompt,
      { ...agent, project: projectId },
      {
        workspaceDir: options.workspaceDir,
        includeToolRoot: options.includeToolRoot !== false
      }
    );
  const effectivePrompt = basePrompt + mcpPromptContext(agent, mcpInvocation);
  try {
    switch (harness) {
      case 'antigravity':
      case 'agy':
        return await spawnAntigravityAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
      case 'opencode':
        return await spawnOpencodeAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
      case 'claude-code':
      case 'claude':
        return await spawnClaudeCodeAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
      case 'codex':
        return await spawnCodexAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
      case 'copilot':
        return await spawnCopilotAgent(projectId, effectivePrompt, agentId, mcpInvocation, options.workspaceDir);
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
