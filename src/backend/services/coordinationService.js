import fs from 'fs';
import path from 'path';
import { SHARED_STATE_DIR } from '../config.js';
import { appendToSharedLog } from './messageService.js';
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

export function recordTask({ projectId, title, description = '', assignee, acceptanceCriteria = [], dependencies = [], createdBy }) {
  const state = loadState();
  const project = projectState(state, requireText(projectId, 'projectId'));
  const task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: requireText(title, 'title'),
    description,
    assignee: requireText(assignee, 'assignee'),
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
  return task;
}

export function updateTaskProgress({ projectId, taskId, agentId, status, summary, percent }) {
  const state = loadState();
  const project = projectState(state, requireText(projectId, 'projectId'));
  const task = project.tasks.find((item) => item.id === taskId && item.assignee === agentId);
  if (!task) throw new Error('Task not found or agent is not its assignee');
  task.status = requireText(status, 'status');
  task.summary = requireText(summary, 'summary');
  if (percent !== undefined) task.percent = Math.max(0, Math.min(100, Number(percent)));
  task.updatedAt = new Date().toISOString();
  project.updates.push({ agentId, taskId, status: task.status, summary: task.summary, at: task.updatedAt });
  saveState(state);
  return task;
}

export function reportBlocker({ projectId, agentId, taskId, blocker, severity = 'medium' }) {
  const state = loadState();
  const project = projectState(state, requireText(projectId, 'projectId'));
  const item = { id: `blocker-${Date.now()}`, agentId, taskId: taskId || null, blocker: requireText(blocker, 'blocker'), severity, status: 'open', createdAt: new Date().toISOString() };
  project.blockers.push(item);
  saveState(state);
  appendToSharedLog(`Blocker [${item.id}] reported by [${agentId}] in [${projectId}].`);
  return item;
}

export function requestHelp({ projectId, agentId, taskId, neededRole, question, urgency = 'normal' }) {
  const state = loadState();
  const project = projectState(state, requireText(projectId, 'projectId'));
  const request = { id: `help-${Date.now()}`, agentId, taskId: taskId || null, neededRole: requireText(neededRole, 'neededRole'), question: requireText(question, 'question'), urgency, status: 'open', createdAt: new Date().toISOString() };
  project.helpRequests.push(request);
  saveState(state);
  appendToSharedLog(`Help request [${request.id}] from [${agentId}] needs [${neededRole}] in [${projectId}].`);
  return request;
}

export function sendAgentMessage({ fromAgentId, toAgentId, projectId, message }) {
  const result = enqueueDirectMessage({ fromAgentId, toAgentId, projectId, message });
  return { accepted: true, ...result.message, duplicate: result.duplicate };
}

export function getProjectCoordination(projectId) {
  return projectState(loadState(), requireText(projectId, 'projectId'));
}
