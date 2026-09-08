import { Router } from 'express';
import { authenticateOrchestrationToken } from '../services/orchestrationAuth.js';
import { loadHrSystem } from '../services/hrService.js';
import { requestAgentSummoning, spawnAgentViaHr } from '../services/agentLifecycle.js';
import { spawnHarnessAgent } from '../services/harnessRunner.js';
import { getProjectCoordination, recordTask, updateTaskProgress, reportBlocker, requestHelp, sendAgentMessage } from '../services/coordinationService.js';

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
router.post('/api/internal/orchestration/message', guard, (req, res) => res.json(sendAgentMessage(req.body)));

export default router;
