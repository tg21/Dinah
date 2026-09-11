import fs from 'fs';
import path from 'path';
import { SHARED_STATE_DIR } from '../config.js';
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

export function recordTask({ projectId, title, description = '', assignee, acceptanceCriteria = [], dependencies = [], createdBy, notify = true }) {
  const state = loadState();
  const cleanProjectId = requireText(projectId, 'projectId');
  const project = projectState(state, cleanProjectId);
  const task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: cleanProjectId,
    title: requireText(title, 'title'),
    description,
    assignee: canonicalAssignee(cleanProjectId, assignee),
    acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [],
    dependencies: Array.isArray(dependencies) ? dependencies : [],
    status: 'assigned',
    createdBy: createdBy || 'orchestrator',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  project.tasks.push(task);
  saveState(state);
  appendToSharedLog(`Task [${task.id}] assigned to [${task.assignee}] in [${projectId}].`);
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
  const request = { id: `help-${Date.now()}`, projectId: cleanProjectId, agentId, taskId: taskId || null, neededRole: requireText(neededRole, 'neededRole'), question: requireText(question, 'question'), urgency, status: 'open', createdAt: new Date().toISOString() };
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

export function askUser({ projectId, agentId, taskId, question }) {
  const textQuestion = requireText(question, 'question');
  const hr = loadHrSystem();
  if (!hr[agentId]) throw new Error('Agent not found');
  hr[agentId].status = 'awaiting-user';
  hr[agentId].pendingUserQuestion = { question: textQuestion, taskId: taskId || null, askedAt: new Date().toISOString() };
  hr[agentId].last_activity_ms = Date.now();
  saveHrSystem(hr);
  appendAgentMessage(agentId, { from: hr[agentId].name || agentId, project: projectId, request: textQuestion, role: 'agent' });
  broadcastAgentEvent({ fromAgentId: agentId, toAgentId: 'user', projectId, type: 'agent_needs_user', snippet: textQuestion.slice(0, 80) });
  appendToSharedLog(`[${agentId}] is waiting for user input in [${projectId}].`);
  return { id: `user-question-${Date.now()}`, agentId, projectId, question: textQuestion, status: 'awaiting-user' };
}

export function sendAgentMessage({ fromAgentId, toAgentId, projectId, message }) {
  const result = enqueueDirectMessage({ fromAgentId, toAgentId, projectId, message });
  return { accepted: true, ...result.message, duplicate: result.duplicate };
}

export function getProjectCoordination(projectId) {
  return projectState(loadState(), requireText(projectId, 'projectId'));
}
