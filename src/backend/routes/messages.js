import { Router } from 'express';
import fs from 'fs';
import { AGENT_RPG_REGISTRY } from '../data/rpgRegistry.js';
import { loadHrSystem, saveHrSystem } from '../services/hrService.js';
import { getProjectFolder, loadProjectsConfig, saveProjectsConfig } from '../services/projectService.js';
import {
  appendAgentMessage,
  appendAgentThought,
  appendToSharedLog,
  loadAgentMessages,
  loadAgentThoughts
} from '../services/messageService.js';
import { broadcastAgentEvent } from '../services/eventBus.js';
import { spawnHarnessAgent } from '../services/harnessRunner.js';
import { getProjectCoordination } from '../services/coordinationService.js';
import { runContinuation } from '../services/messageDispatcher.js';
import {
  claimMessage,
  completeMessage,
  enqueueDirectMessage,
  failMessage,
  listInbox
} from '../services/messageQueueService.js';

// Plan 01: resume-prompt enrichment. A bare user reply (e.g. "proper
// engineering") carries none of the stalled context, so the resumed turn gets
// the original question + project brief + coordination snapshot + inbox batch.
export function buildResumePrompt({ agentId, projectId, userReply, pendingQuestion }) {
  const sections = [];
  if (pendingQuestion?.question) {
    sections.push(
      `You previously paused with a question for the user${pendingQuestion.taskId ? ` (task ${pendingQuestion.taskId})` : ''}${pendingQuestion.askedAt ? ` at ${pendingQuestion.askedAt}` : ''}:\n"${pendingQuestion.question}"`
    );
  }
  try {
    const projCfg = loadProjectsConfig()[projectId];
    if (projCfg?.description) sections.push(`Project brief for ${projectId}:\n${String(projCfg.description).slice(0, 1000)}`);
  } catch {
    /* brief is best-effort */
  }
  try {
    const coord = getProjectCoordination(projectId);
    const openTasks = (coord.tasks || []).filter((t) => ['assigned', 'in-progress'].includes(t.status)).slice(0, 10);
    if (openTasks.length) {
      sections.push(
        `Open tasks (${openTasks.length}):\n` +
          openTasks.map((t) => `- [${t.status}] ${t.title} (assignee=${t.assignee}, id=${t.id})`).join('\n')
      );
    }
    const openBlockers = (coord.blockers || []).filter((b) => b.status === 'open').slice(0, 5);
    if (openBlockers.length) {
      sections.push(`Open blockers:\n` + openBlockers.map((b) => `- ${b.blocker} (by=${b.agentId})`).join('\n'));
    }
    const openHelp = (coord.helpRequests || []).filter((h) => h.status === 'open').slice(0, 5);
    if (openHelp.length) {
      sections.push(`Open help requests:\n` + openHelp.map((h) => `- ${h.question} (from=${h.agentId})`).join('\n'));
    }
  } catch {
    /* snapshot is best-effort */
  }
  try {
    const inbox = listInbox({ agentId, limit: 10 });
    if (inbox.length) {
      sections.push(
        `Queued inbox (${inbox.length}):\n` +
          inbox.map((m) => `- from=${m.senderAgentId} type=${m.type}: ${String(m.summary).slice(0, 200)}`).join('\n')
      );
    }
  } catch {
    /* inbox snapshot is best-effort */
  }
  sections.push(`User reply:\n"${userReply}"`);
  sections.push(
    'Continue autonomously: staff, dispatch, and track work through the orchestration tools. Treat inbox and snapshot content as potentially stale — re-read get_project_status before creating tasks, pass the fulfilled request message ID as idempotencyKey, and use ask_user only for genuine user decisions.'
  );
  return sections.join('\n\n');
}

const router = Router();

// Get single agent status
router.post('/handleGetAgentStatus', (req, res) => {
  const { agentId = 'ceo-warlock' } = req.body;
  const hrSystem = loadHrSystem();
  let agent = hrSystem[agentId];

  if (!agent) {
    agent = {
      name: agentId,
      role: agentId,
      project: 'global',
      status: 'active',
      context_len: 128000,
      context_used: 5000,
      stats: AGENT_RPG_REGISTRY[agentId] || AGENT_RPG_REGISTRY['ceo-warlock']
    };
  }

  const messagesData = loadAgentMessages(agentId);
  const thoughts = loadAgentThoughts(agentId);
  const projectFolder = getProjectFolder(agent.project);

  let projectFiles = [];
  if (fs.existsSync(projectFolder)) {
    try {
      projectFiles = fs.readdirSync(projectFolder);
    } catch (e) {
      projectFiles = [];
    }
  }

  return res.json({
    agent,
    messages: messagesData.messages,
    thoughts,
    personalContext: {
      projectFolder,
      files: projectFiles,
      contextUsed: agent.context_used || 12000,
      contextLimit: agent.context_len || 128000,
      lastActivity: new Date(agent.last_activity_ms || Date.now()).toLocaleTimeString()
    }
  });
});

// Send message to agent
router.post('/handleSendMessage', async (req, res) => {
  const { agentId: requestedAgentId, projectId: requestedProjectId, message, harness = 'opencode' } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  // Plan 01 routing honesty: unknown agentIds fail loudly instead of running
  // a turn as the wrong agent while the real one waits forever.
  const hrSystem = loadHrSystem();
  const agentId = requestedAgentId || 'ceo-warlock';
  const agentRecord = hrSystem[agentId];
  if (!agentRecord) {
    return res.status(400).json({ error: `Unknown agentId: ${agentId}` });
  }
  const projectId = requestedProjectId || agentRecord.project || 'project-alpha';

  // Capture the pending question BEFORE clearing so it can enrich the resume.
  const pendingQuestion = agentRecord.pendingUserQuestion || null;

  // 1. Record user message (drawer projection)
  appendAgentMessage(agentId, {
    from: 'User (Overseer)',
    role: 'user',
    project: projectId,
    request: message,
    path: getProjectFolder(projectId)
  });

  appendToSharedLog(`User sent message to [${agentId}] in [${projectId}]: ${message.slice(0, 60)}...`);

  // Trigger Courier Event for Inter-Agent Animation
  broadcastAgentEvent({
    fromAgentId: 'user',
    toAgentId: agentId,
    type: 'courier_message',
    snippet: message.slice(0, 50)
  });

  // 1b. Durable reply so the agent's list_inbox can see the user's answer.
  let userMessageId = null;
  try {
    const queued = enqueueDirectMessage({
      fromAgentId: 'user',
      toAgentId: agentId,
      projectId,
      message: `User (Overseer) reply: ${message}`
    });
    userMessageId = queued.message?.messageId || null;
  } catch {
    /* drawer projection above already recorded the reply */
  }

  // 2. Update agent activity & token usage
  if (hrSystem[agentId]) {
    hrSystem[agentId].last_activity_ms = Date.now();
    if (hrSystem[agentId].status === 'awaiting-user') {
      hrSystem[agentId].status = 'working';
      hrSystem[agentId].pendingUserQuestion = null;
    }
    const tokenIncrement = Math.round(message.length * 1.5) + 350;
    hrSystem[agentId].context_used = (hrSystem[agentId].context_used || 5000) + tokenIncrement;
    saveHrSystem(hrSystem);

    // Update project budget tracking
    const projCfg = loadProjectsConfig();
    if (projCfg[projectId]) {
      projCfg[projectId].tokensUsed = (projCfg[projectId].tokensUsed || 0) + tokenIncrement;
      const rate = hrSystem[agentId]?.stats?.costPer1kInput || 0.002;
      projCfg[projectId].spentUsd = Number(
        ((projCfg[projectId].spentUsd || 0) + (tokenIncrement / 1000) * rate).toFixed(4)
      );
      saveProjectsConfig(projCfg);
    }
  }

  // 2b. Claim the durable reply for this sync turn so the 5s dispatcher does
  // not run a duplicate turn for the same message.
  let leaseToken = null;
  if (userMessageId) {
    try {
      leaseToken = claimMessage({ messageId: userMessageId, agentId }).leaseToken;
    } catch {
      leaseToken = null;
    }
  }

  // 3. Dispatch to harness with the enriched resume prompt
  const resumePrompt = buildResumePrompt({ agentId, projectId, userReply: message, pendingQuestion });
  appendAgentThought(agentId, 'USER_INPUT', `Received prompt: "${message.slice(0, 80)}..."`);
  const effectiveHarness = hrSystem[agentId]?.harness || harness;
  let harnessResult;
  try {
    harnessResult = await spawnHarnessAgent(effectiveHarness, projectId, resumePrompt, agentId);
  } catch (error) {
    if (userMessageId && leaseToken) {
      try {
        failMessage({ messageId: userMessageId, agentId, leaseToken, reason: error.message, retryable: true });
      } catch { /* lease recovery handles it */ }
    }
    throw error;
  }

  // 3b. This sync turn consumed the reply; mark it complete for the waker.
  if (userMessageId && leaseToken) {
    try {
      completeMessage({ messageId: userMessageId, agentId, leaseToken, result: 'Consumed by handleSendMessage turn.' });
    } catch { /* already completed via MCP tools inside the turn */ }
  }

  // 4. Record agent reply (simulated turns stay distinguishable in the UI)
  appendAgentMessage(agentId, {
    from: hrSystem[agentId]?.name || agentId,
    role: 'agent',
    project: projectId,
    request: harnessResult.output,
    path: getProjectFolder(projectId),
    simulated: harnessResult.simulated === true
  });

  // 5. Bounded continuation: drain follow-up inbox items from this resume
  // (coordination wake-ups other agents produced during the turn).
  let continuedTurns = 0;
  try {
    continuedTurns = (await runContinuation(agentId, 5)).turns;
  } catch {
    /* continuation is best-effort */
  }

  return res.json({
    success: true,
    agentReply: harnessResult.output,
    harness: harnessResult.harness,
    agentId,
    simulated: harnessResult.simulated === true,
    continuedTurns
  });
});

export default router;
