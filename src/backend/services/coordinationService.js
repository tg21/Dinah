import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SHARED_STATE_DIR, getTaskDedupeWindowMs } from '../config.js';
import { appendToSharedLog, appendAgentMessage } from './messageService.js';
import { loadHrSystem, saveHrSystem } from './hrService.js';
import { broadcastAgentEvent } from './eventBus.js';
import { enqueueDirectMessage } from './messageQueueService.js';

const COORDINATION_FILE = path.join(SHARED_STATE_DIR, 'coordination.json');

function loadState() {
  if (!fs.existsSync(COORDINATION_FILE)) return { projects: {} };
  try {
    return JSON.parse(fs.readFileSync(COORDINATION_FILE, 'utf8'));
  } catch {
    return { projects: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(COORDINATION_FILE, JSON.stringify(state, null, 2));
}

function projectState(state, projectId) {
  state.projects[projectId] ||= { tasks: [], updates: [], blockers: [], helpRequests: [] };
  return state.projects[projectId];
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

// Duplicate-assignment guard (stale-read race): two layers so a manager that
// processes the same need-work request twice — or acts on a stale inbox while
// a parallel turn already assigned the work — cannot fork duplicate tasks.
// Layer 1 is an explicit caller idempotency key; layer 2 is a content
// fingerprint, so identical re-creates collapse even without caller
// cooperation, while a same-titled task with expanded scope (different
// description/criteria → different fingerprint) still creates fresh.
function normalizeContent(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function taskFingerprint({ title, description = '', acceptanceCriteria = [] }) {
  const criteria = Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [];
  return crypto
    .createHash('sha1')
    .update([normalizeContent(title), normalizeContent(description), ...criteria.map(normalizeContent)].join('\n'))
    .digest('hex');
}

function isOpenTask(task) {
  return task && ['assigned', 'in-progress'].includes(task.status);
}

function createdWithinMs(task, windowMs, now = Date.now()) {
  const created = new Date(task.createdAt || 0).getTime();
  return Number.isFinite(created) && now - created <= windowMs;
}

// Plan 01: coordination-write wake-ups. Progress/blocker/help/task writes are
// otherwise invisible to the dispatcher (queued-inbox only), so the manager
// never learns that workers moved. Notify the interested party through the
// durable queue; the dispatcher wakes them within seconds. Best-effort and
// self-notify-safe: never wake the writer about their own write, and never
// queue for paused/retired agents (the dispatcher would skip them anyway).
function findProjectManagerId(projectId) {
  try {
    const entry = Object.entries(loadHrSystem()).find(([, agent]) =>
      agent.project === projectId && agent.role === 'manager-bard' && agent.status !== 'retired'
    );
    return entry ? entry[0] : null;
  } catch {
    return null;
  }
}

function notifyAgent({ fromAgentId, toAgentId, projectId, message }) {
  if (!toAgentId || toAgentId === fromAgentId) return;
  let status;
  try {
    status = loadHrSystem()[toAgentId]?.status;
  } catch {
    return;
  }
  if (!['active', 'working', 'awaiting-user'].includes(status)) return;
  try {
    enqueueDirectMessage({ fromAgentId, toAgentId, projectId, message });
  } catch {
    /* wake-ups must never break coordination writes */
  }
}

export function canonicalAssignee(projectId, assignee) {
  const requested = requireText(assignee, 'assignee');
  const hr = loadHrSystem();
  if (hr[requested]?.project === projectId) return requested;

  // Models commonly use the role name returned by the roster instead of the
  // project-scoped agent id. Store the id so later progress updates from that
  // agent can find the task reliably.
  const matches = Object.entries(hr).filter(([, agent]) =>
    agent.project === projectId && agent.role === requested && ['active', 'working'].includes(agent.status)
  );
  if (matches.length === 1) return matches[0][0];
  // Multi/no-match: keep input verbatim so readers can still resolve it, but
  // warn loudly instead of silently storing an unresolvable name (plan 06).
  try {
    appendToSharedLog(
      `Assignee [${requested}] in [${projectId}] did not resolve to a unique agent (${matches.length} matches); storing verbatim.`
    );
  } catch { /* logging must never break task creation */ }
  return requested;
}

export function recordTask({ projectId, title, description = '', assignee, acceptanceCriteria = [], dependencies = [], createdBy, notify = true, idempotencyKey = null }) {
  const state = loadState();
  const cleanProjectId = requireText(projectId, 'projectId');
  const project = projectState(state, cleanProjectId);
  const cleanTitle = requireText(title, 'title');
  const cleanAssignee = canonicalAssignee(cleanProjectId, assignee);
  const cleanCriteria = Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [];
  const key = typeof idempotencyKey === 'string' && idempotencyKey.trim() ? idempotencyKey.trim() : null;
  if (key) {
    const keyed = project.tasks.find((t) => t.idempotencyKey === key && isOpenTask(t));
    if (keyed) {
      appendToSharedLog(`Task create deduped by idempotency key; returning open [${keyed.id}] in [${cleanProjectId}].`);
      return { ...keyed, duplicate: true };
    }
  }
  const fingerprint = taskFingerprint({ title: cleanTitle, description, acceptanceCriteria: cleanCriteria });
  const windowMs = getTaskDedupeWindowMs();
  const similar = project.tasks.find((t) =>
    isOpenTask(t) &&
    t.assignee === cleanAssignee &&
    (t.fingerprint || taskFingerprint(t)) === fingerprint &&
    createdWithinMs(t, windowMs)
  );
  if (similar) {
    appendToSharedLog(`Task create deduped by content fingerprint; returning open [${similar.id}] in [${cleanProjectId}].`);
    return { ...similar, duplicate: true };
  }
  const task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: cleanProjectId,
    title: cleanTitle,
    description,
    assignee: cleanAssignee,
    acceptanceCriteria: cleanCriteria,
    dependencies: Array.isArray(dependencies) ? dependencies : [],
    status: 'assigned',
    createdBy: createdBy || 'orchestrator',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fingerprint,
    ...(key ? { idempotencyKey: key } : {})
  };
  project.tasks.push(task);
  saveState(state);
  appendToSharedLog(`Task [${task.id}] assigned to [${task.assignee}] in [${projectId}].`);
  // Same assignee+title but different content (e.g. expanded scope): both are
  // kept — flag the overlap so the manager reconciles consciously next turn.
  const sameTitle = project.tasks.find((t) =>
    t.id !== task.id && isOpenTask(t) && t.assignee === task.assignee &&
    normalizeContent(t.title) === normalizeContent(task.title)
  );
  if (sameTitle) {
    appendToSharedLog(`Task [${task.id}] overlaps open [${sameTitle.id}] (same assignee+title, different content); both kept for manager review.`);
  }
  // Wake the assignee so the task starts without a user message. Skipped when
  // the caller dispatches directly (dispatch:true already runs a harness turn).
  if (notify) {
    notifyAgent({
      fromAgentId: task.createdBy,
      toAgentId: task.assignee,
      projectId: cleanProjectId,
      message: `New task [${task.id}] assigned to [${task.assignee}]: ${task.title}` +
        (task.description ? `\n\n${task.description}` : '') +
        (task.acceptanceCriteria.length ? `\n\nAcceptance criteria:\n${task.acceptanceCriteria.join('\n')}` : '')
    });
  }
  return task;
}

export function updateTaskProgress({ projectId, taskId, agentId, status, summary, percent }) {
  const state = loadState();
  const cleanProjectId = requireText(projectId, 'projectId');
  const project = projectState(state, cleanProjectId);
  const agent = loadHrSystem()[agentId];
  const task = project.tasks.find((item) =>
    item.id === taskId && (
      item.createdBy === agentId ||
      item.assignee === agentId ||
      item.assignee === agent?.role
    )
  );
  if (!task) throw new Error('Task not found or agent is not its assignee');
  if (task.assignee !== agentId && task.createdBy !== agentId) task.assignee = agentId;
  task.status = requireText(status, 'status');
  task.summary = requireText(summary, 'summary');
  if (percent !== undefined) task.percent = Math.max(0, Math.min(100, Number(percent)));
  task.updatedAt = new Date().toISOString();
  if (!task.projectId) task.projectId = cleanProjectId;
  project.updates.push({ agentId, taskId, projectId: cleanProjectId, status: task.status, summary: task.summary, at: task.updatedAt });
  saveState(state);
  // Wake the task creator (usually the manager) so dependent work can be
  // allocated as soon as this update lands. Self-updates stay silent.
  notifyAgent({
    fromAgentId: agentId,
    toAgentId: task.createdBy,
    projectId: cleanProjectId,
    message: `Progress on [${task.id}] "${task.title}" by [${agentId}]: status=${task.status} — ${task.summary}`
  });
  return task;
}

export function reportBlocker({ projectId, agentId, taskId, blocker, severity = 'medium' }) {
  const state = loadState();
  const cleanProjectId = requireText(projectId, 'projectId');
  const project = projectState(state, cleanProjectId);
  const item = { id: `blocker-${Date.now()}`, projectId: cleanProjectId, agentId, taskId: taskId || null, blocker: requireText(blocker, 'blocker'), severity, status: 'open', createdAt: new Date().toISOString() };
  project.blockers.push(item);
  saveState(state);
  appendToSharedLog(`Blocker [${item.id}] reported by [${agentId}] in [${projectId}].`);
  notifyAgent({
    fromAgentId: agentId,
    toAgentId: findProjectManagerId(cleanProjectId),
    projectId: cleanProjectId,
    message: `Blocker [${item.id}] reported by [${agentId}]${taskId ? ` on [${taskId}]` : ''} (severity=${severity}): ${item.blocker}`
  });
  return item;
}

export function requestHelp({ projectId, agentId, taskId, neededRole, question, urgency = 'normal' }) {
  const state = loadState();
  const cleanProjectId = requireText(projectId, 'projectId');
  const project = projectState(state, cleanProjectId);
  const cleanRole = requireText(neededRole, 'neededRole');
  const cleanQuestion = requireText(question, 'question');
  // Same dedupe shape as tasks: an identical open request collapses instead of
  // stacking (chatty workers, stale re-processing).
  const windowMs = getTaskDedupeWindowMs();
  const now = Date.now();
  const fingerprint = taskFingerprint({ title: cleanRole, description: cleanQuestion });
  const existing = project.helpRequests.find((h) =>
    h.status === 'open' && h.agentId === agentId && (h.fingerprint || taskFingerprint({ title: h.neededRole, description: h.question })) === fingerprint &&
    createdWithinMs(h, windowMs, now)
  );
  if (existing) {
    appendToSharedLog(`Help request deduped by content fingerprint; returning open [${existing.id}] in [${cleanProjectId}].`);
    return { ...existing, duplicate: true };
  }
  const request = { id: `help-${Date.now()}`, projectId: cleanProjectId, agentId, taskId: taskId || null, neededRole: cleanRole, question: cleanQuestion, urgency, status: 'open', createdAt: new Date().toISOString(), fingerprint };
  project.helpRequests.push(request);
  saveState(state);
  appendToSharedLog(`Help request [${request.id}] from [${agentId}] needs [${neededRole}] in [${projectId}].`);
  notifyAgent({
    fromAgentId: agentId,
    toAgentId: findProjectManagerId(cleanProjectId),
    projectId: cleanProjectId,
    message: `Help request [${request.id}] from [${agentId}] needs [${neededRole}] (urgency=${urgency}): ${request.question}`
  });
  return request;
}

function normalizeOptions(value) {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim().slice(0, 200))
    .slice(0, 10);
}

export function askUser({ projectId, agentId, taskId, question, options }) {
  const textQuestion = requireText(question, 'question');
  const cleanOptions = normalizeOptions(options);
  const hr = loadHrSystem();
  if (!hr[agentId]) throw new Error('Agent not found');
  hr[agentId].status = 'awaiting-user';
  hr[agentId].pendingUserQuestion = { question: textQuestion, options: cleanOptions, taskId: taskId || null, askedAt: new Date().toISOString() };
  hr[agentId].last_activity_ms = Date.now();
  saveHrSystem(hr);
  appendAgentMessage(agentId, { from: hr[agentId].name || agentId, project: projectId, request: textQuestion, role: 'agent', kind: 'user-question', options: cleanOptions });
  broadcastAgentEvent({ fromAgentId: agentId, toAgentId: 'user', projectId, type: 'agent_needs_user', snippet: textQuestion.slice(0, 80) });
  appendToSharedLog(`[${agentId}] is waiting for user input in [${projectId}].`);
  return { id: `user-question-${Date.now()}`, agentId, projectId, question: textQuestion, options: cleanOptions, status: 'awaiting-user' };
}

export function informUser({ projectId, agentId, taskId, message }) {
  const textMessage = requireText(message, 'message');
  const hr = loadHrSystem();
  if (!hr[agentId]) throw new Error('Agent not found');
  hr[agentId].last_activity_ms = Date.now();
  saveHrSystem(hr);
  appendAgentMessage(agentId, { from: hr[agentId].name || agentId, project: projectId, request: textMessage, role: 'agent', kind: 'user-inform' });
  broadcastAgentEvent({ fromAgentId: agentId, toAgentId: 'user', projectId, type: 'agent_informs_user', snippet: textMessage.slice(0, 80) });
  appendToSharedLog(`[${agentId}] informed the user in [${projectId}].`);
  return { id: `user-inform-${Date.now()}`, agentId, projectId, message: textMessage, taskId: taskId || null, status: hr[agentId].status };
}

export function sendAgentMessage({ fromAgentId, toAgentId, projectId, message }) {
  const result = enqueueDirectMessage({ fromAgentId, toAgentId, projectId, message });
  return { accepted: true, ...result.message, duplicate: result.duplicate };
}

export function getProjectCoordination(projectId) {
  return projectState(loadState(), requireText(projectId, 'projectId'));
}
