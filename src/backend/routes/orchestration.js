import { Router } from 'express';
import { authenticateOrchestrationToken } from '../services/orchestrationAuth.js';
import { loadHrSystem } from '../services/hrService.js';
import { requestAgentSummoning, spawnAgentViaHr, ensureProjectManager, sendProjectBriefToManager } from '../services/agentLifecycle.js';
import { createProjectFolder, loadProjectsConfig, saveProjectsConfig } from '../services/projectService.js';
import { askUser } from '../services/coordinationService.js';
import { spawnHarnessAgent } from '../services/harnessRunner.js';
import { getProjectCoordination, recordTask, updateTaskProgress, reportBlocker, requestHelp, sendAgentMessage } from '../services/coordinationService.js';
import {
  publishProjectMessage, listInbox, claimMessage, acknowledgeMessage, completeMessage,
  failMessage, releaseMessage, getMessageStatus, subscribeToProject
} from '../services/messageQueueService.js';

const router = Router();

function guard(req, res, next) {
  const { agentId, projectId } = req.body || {};
  if (!authenticateOrchestrationToken(req.get('x-dinah-mcp-token'), agentId, projectId)) {
    return res.status(403).json({ error: 'Invalid or expired orchestration grant' });
  }
  next();
}

router.post('/api/internal/orchestration/status', guard, (req, res) => {
  const hr = loadHrSystem();
  const coordination = getProjectCoordination(req.body.projectId);
  const agents = Object.entries(hr)
    .filter(([, agent]) => (agent.project || 'global') === req.body.projectId)
    .map(([id, agent]) => ({ id, name: agent.name, role: agent.role, status: agent.status, lastActivity: agent.last_activity_ms, contextUsed: agent.context_used, contextLimit: agent.context_len }));
  res.json({ projectId: req.body.projectId, agents, coordination });
});

router.post('/api/internal/orchestration/create-project', guard, (req, res) => {
  if (req.body.agentId !== 'ceo-warlock') return res.status(403).json({ error: 'Only CEO Warlock may create projects through this tool' });
  const projectId = String(req.body.newProjectId || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (!projectId) return res.status(400).json({ error: 'projectId is required; ask the user for a project name' });
  createProjectFolder(projectId, req.body.customPath || null);
  const cfg = loadProjectsConfig();
  if (req.body.description) cfg[projectId].description = req.body.description;
  saveProjectsConfig(cfg);
  const manager = ensureProjectManager(projectId);
  sendProjectBriefToManager(projectId, manager.agentId, req.body.description || 'No brief supplied; ask the user for missing requirements before planning.');
  res.json({ success: true, projectId, managerAgentId: manager.agentId, managerCreated: manager.created });
});

router.post('/api/internal/orchestration/staff', guard, (req, res) => {
  const result = requestAgentSummoning(req.body.role, req.body.projectId, {
    name: req.body.name,
    model: req.body.model,
    harness: req.body.harness,
    effortLevel: req.body.effortLevel,
    promptOverride: req.body.promptOverride
  });
  res.json(result);
});

router.post('/api/internal/orchestration/provision', guard, (req, res) => {
  const hr = loadHrSystem()[req.body.agentId];
  if (req.body.agentId !== 'hr-mind-flayer' || hr?.role !== 'hr-mind-flayer') {
    return res.status(403).json({ error: 'Only HR Mind Flayer may provision agents' });
  }
  const result = spawnAgentViaHr(req.body.role, req.body.projectId, req.body.name || null, {
    model: req.body.model,
    harness: req.body.harness,
    effortLevel: req.body.effortLevel,
    promptOverride: req.body.promptOverride
  });
  res.json(result);
});

router.post('/api/internal/orchestration/task', guard, (req, res) => {
  const task = recordTask({ ...req.body, createdBy: req.body.agentId });
  if (req.body.dispatch === true) {
    const hr = loadHrSystem();
    const assignee = hr[req.body.assignee];
    if (!assignee) return res.status(404).json({ error: 'Assignee not found' });
    if (!['active', 'working'].includes(assignee.status)) return res.status(409).json({ error: 'Assignee is not active' });
    const result = spawnHarnessAgent(assignee.harness, req.body.projectId, `${task.title}\n\n${task.description}\n\nAcceptance criteria:\n${task.acceptanceCriteria.join('\n')}`, req.body.assignee);
    return res.json({ task, dispatch: result });
  }
  res.json({ task });
});

router.post('/api/internal/orchestration/progress', guard, (req, res) => res.json({ task: updateTaskProgress(req.body) }));
router.post('/api/internal/orchestration/blocker', guard, (req, res) => res.json({ blocker: reportBlocker(req.body) }));
router.post('/api/internal/orchestration/help', guard, (req, res) => res.json({ request: requestHelp(req.body) }));
router.post('/api/internal/orchestration/ask-user', guard, (req, res) => res.json({ request: askUser(req.body) }));
router.post('/api/internal/orchestration/message', guard, (req, res) => res.json(sendAgentMessage(req.body)));
router.post('/api/internal/orchestration/project-message', guard, (req, res) => res.json(publishProjectMessage(req.body)));
router.post('/api/internal/orchestration/subscribe', guard, (req, res) => res.json(subscribeToProject(req.body)));
router.post('/api/internal/orchestration/inbox', guard, (req, res) => res.json({ messages: listInbox(req.body) }));
router.post('/api/internal/orchestration/claim', guard, (req, res) => res.json(claimMessage(req.body)));
router.post('/api/internal/orchestration/acknowledge', guard, (req, res) => res.json(acknowledgeMessage(req.body)));
router.post('/api/internal/orchestration/complete', guard, (req, res) => res.json(completeMessage(req.body)));
router.post('/api/internal/orchestration/fail', guard, (req, res) => res.json(failMessage(req.body)));
router.post('/api/internal/orchestration/release', guard, (req, res) => res.json(releaseMessage(req.body)));
router.post('/api/internal/orchestration/message-status', guard, (req, res) => res.json(getMessageStatus(req.body)));

export default router;
