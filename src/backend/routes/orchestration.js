import { Router } from 'express';
import { authenticateOrchestrationToken } from '../services/orchestrationAuth.js';
import { loadHrSystem } from '../services/hrService.js';
import { requestAgentSummoning, spawnAgentViaHr, ensureProjectManager, sendProjectBriefToManager } from '../services/agentLifecycle.js';
import { createProjectFolder, loadProjectsConfig, saveProjectsConfig, slugifyProjectId } from '../services/projectService.js';
import { askUser, canonicalAssignee } from '../services/coordinationService.js';
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
  const projectId = slugifyProjectId(req.body.newProjectId || '');
  if (!projectId || projectId === 'project') return res.status(400).json({ error: 'projectId is required; ask the user for a project name' });
  createProjectFolder(projectId, req.body.customPath || null);
  const cfg = loadProjectsConfig();
  if (req.body.description) cfg[projectId].description = req.body.description;
  saveProjectsConfig(cfg);
  const manager = ensureProjectManager(projectId);
  sendProjectBriefToManager(projectId, manager.agentId, req.body.description || 'No brief supplied; ask the user for missing requirements before planning.');
  res.json({ success: true, projectId, managerAgentId: manager.agentId, managerCreated: manager.created });
});

router.post('/api/internal/orchestration/staff', guard, (req, res) => {
  try {
    const result = requestAgentSummoning(req.body.role, req.body.projectId, {
      name: req.body.name,
      model: req.body.model,
      harness: req.body.harness,
      effortLevel: req.body.effortLevel,
      promptOverride: req.body.promptOverride,
      requesterId: req.body.agentId
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/api/internal/orchestration/provision', guard, (req, res) => {
  const hr = loadHrSystem()[req.body.agentId];
  if (req.body.agentId !== 'hr-mind-flayer' || hr?.role !== 'hr-mind-flayer') {
    return res.status(403).json({ error: 'Only HR Mind Flayer may provision agents' });
  }
  try {
    const result = spawnAgentViaHr(req.body.role, req.body.projectId, req.body.name || null, {
      model: req.body.model,
      harness: req.body.harness,
      effortLevel: req.body.effortLevel,
      promptOverride: req.body.promptOverride
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/api/internal/orchestration/task', guard, async (req, res) => {
  // dispatch:true runs a harness turn directly, which already carries the task
  // content — skip the queue wake-up so the worker isn't woken twice.
  const task = recordTask({ ...req.body, createdBy: req.body.agentId, notify: req.body.dispatch !== true });
  if (req.body.dispatch === true) {
    const hr = loadHrSystem();
    // Resolve role names via canonicalAssignee so dispatch:true works with
    // roster role names instead of 404ing on exact IDs (plan 07 groundwork,
    // plan 06 canonicalization).
    let assigneeId;
    try {
      assigneeId = canonicalAssignee(req.body.projectId, req.body.assignee);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const assignee = hr[assigneeId];
    if (!assignee) return res.status(404).json({ error: 'Assignee not found' });
    if (!['active', 'working'].includes(assignee.status)) return res.status(409).json({ error: 'Assignee is not active' });
    const result = await spawnHarnessAgent(assignee.harness, req.body.projectId, `${task.title}\n\n${task.description}\n\nAcceptance criteria:\n${task.acceptanceCriteria.join('\n')}`, assigneeId);
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

// Queue lease ops throw on stale callers (expired lease, double claim). Map to
// structured JSON so harness agents get a retryable error instead of an HTML
// 500 + terminal stack trace.
function queueRoute(fn) {
  return (req, res) => {
    try {
      res.json(fn(req.body));
    } catch (error) {
      const message = error.message || 'Queue operation failed';
      const status = /not found/i.test(message) ? 404 : /already claimed|lease/i.test(message) ? 409 : 400;
      res.status(status).json({ error: message });
    }
  };
}
router.post('/api/internal/orchestration/claim', guard, queueRoute((body) => claimMessage(body)));
router.post('/api/internal/orchestration/acknowledge', guard, queueRoute((body) => acknowledgeMessage(body)));
router.post('/api/internal/orchestration/complete', guard, queueRoute((body) => completeMessage(body)));
router.post('/api/internal/orchestration/fail', guard, queueRoute((body) => failMessage(body)));
router.post('/api/internal/orchestration/release', guard, queueRoute((body) => releaseMessage(body)));
router.post('/api/internal/orchestration/message-status', guard, queueRoute((body) => getMessageStatus(body)));

export default router;
