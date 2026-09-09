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
router.post('/handleSendMessage', (req, res) => {
  const { agentId = 'ceo-warlock', projectId = 'project-alpha', message, harness = 'opencode' } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  // 1. Record user message
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

  // 2. Update agent activity & token usage
  const hrSystem = loadHrSystem();
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

  // 3. Dispatch to harness
  appendAgentThought(agentId, 'USER_INPUT', `Received prompt: "${message.slice(0, 80)}..."`);
  const effectiveHarness = hrSystem[agentId]?.harness || harness;
  const harnessResult = spawnHarnessAgent(effectiveHarness, projectId, message, agentId);

  // 4. Record agent reply
  appendAgentMessage(agentId, {
    from: hrSystem[agentId]?.name || agentId,
    role: 'agent',
    project: projectId,
    request: harnessResult.output,
    path: getProjectFolder(projectId)
  });

  return res.json({
    success: true,
    agentReply: harnessResult.output,
    harness: harnessResult.harness,
    agentId
  });
});

export default router;
