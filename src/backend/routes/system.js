import { Router } from 'express';
import fs from 'fs';
import { DINAH_MARKER_FILE, TOOL_DIR, WORKING_DIR, USING_DEFAULT_WORKING_AREA } from '../config.js';
import { getAgentEventQueue } from '../services/eventBus.js';
import { loadHrSystem } from '../services/hrService.js';
import { getSharedStateLogFile, loadAgentThoughts } from '../services/messageService.js';
import { ROLE_THOUGHT_POOLS } from '../data/rpgRegistry.js';
import { getProjectMessageActivity } from '../services/messageQueueService.js';

const router = Router();

function loadWorkspaceMarker() {
  if (!fs.existsSync(DINAH_MARKER_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(DINAH_MARKER_FILE, 'utf-8'));
  } catch {
    return { valid: false };
  }
}

router.get('/api/system/workspace', (req, res) => {
  res.json({
    toolRoot: TOOL_DIR,
    workingDirectory: WORKING_DIR,
    markerFile: DINAH_MARKER_FILE,
    usingDefaultWorkingArea: USING_DEFAULT_WORKING_AREA,
    marker: loadWorkspaceMarker()
  });
});

// Shared state log
router.post('/handleGetSharedLog', (req, res) => {
  const logFile = getSharedStateLogFile();
  if (!fs.existsSync(logFile)) {
    return res.json({ log: [] });
  }
  const content = fs.readFileSync(logFile, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());
  return res.json({ log: lines });
});

// Inter-Agent Event Stream
router.get('/api/events', (req, res) => {
  res.json({ events: getAgentEventQueue() });
});

router.get('/api/message-activity', (req, res) => {
  res.json({ messages: getProjectMessageActivity({ projectId: req.query.projectId || 'global' }) });
});

// Relationships graph
router.get('/api/relationships', (req, res) => {
  const hrSystem = loadHrSystem();
  const agents = Object.entries(hrSystem).map(([id, a]) => ({
    id,
    name: a.name || id,
    role: a.role || id,
    project: a.project || 'global',
    color: a.stats?.avatarColor || 0x9b59b6,
    status: a.status || 'active'
  }));

  const links = [];
  for (const agentId of Object.keys(hrSystem)) {
    if (agentId !== 'ceo-warlock') {
      links.push({ source: 'ceo-warlock', target: agentId, value: 5 });
    }
    if (agentId !== 'hr-mind-flayer') {
      links.push({ source: 'hr-mind-flayer', target: agentId, value: 8 });
    }
    if (agentId !== 'senior-analyst-diviner') {
      links.push({ source: 'senior-analyst-diviner', target: agentId, value: 3 });
    }
  }

  res.json({ nodes: agents, links });
});

// API: Get live thoughts for all agents
router.get('/api/agent-thoughts', (req, res) => {
  const hrSystem = loadHrSystem();
  const thoughtsMap = {};
  for (const [agentId, agent] of Object.entries(hrSystem)) {
    const role = agent.role || 'manager-bard';
    const rolePool = ROLE_THOUGHT_POOLS[role] || [
      'Processing task directives...',
      'Marinating on optimal approach...',
      'Analyzing project context...'
    ];
    const loggedThoughts = loadAgentThoughts(agentId);
    const lastThought =
      loggedThoughts.length > 0 ? loggedThoughts[loggedThoughts.length - 1].thought : null;
    const randomThought = rolePool[Math.floor(Math.random() * rolePool.length)];
    thoughtsMap[agentId] = {
      agentId,
      name: agent.name || agentId,
      role: agent.role,
      project: agent.project,
      status: agent.status || 'active',
      currentThought: lastThought || randomThought,
      thoughtPool: rolePool
    };
  }
  res.json({ thoughts: thoughtsMap });
});

export default router;
