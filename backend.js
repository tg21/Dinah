import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

// ============================================================
// EXPRESS APP SETUP
// ============================================================

const app = express();
const PORT = process.env.PORT || 2121;
const APP_DIR = process.cwd();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// ============================================================
// DIRECTORY STRUCTURE
// ============================================================

const HR_SYSTEM_DIR = path.join(APP_DIR, 'hr-system');
const AGENT_TEMPLATES_DIR = path.join(APP_DIR, 'agent-templates');
const SHARED_STATE_DIR = path.join(APP_DIR, 'shared-state');
const PROJECTS_DIR = path.join(APP_DIR, 'projects');

// Ensure directories exist
ensureDirExists(HR_SYSTEM_DIR);
ensureDirExists(AGENT_TEMPLATES_DIR);
ensureDirExists(SHARED_STATE_DIR);
ensureDirExists(PROJECTS_DIR);

// ============================================================
// HR SYSTEM JSON - File-based agent registry
// Stored in hr-system/ directory
// ============================================================

const HR_SYSTEM_FILE = path.join(HR_SYSTEM_DIR, 'hr-system.json');

function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadHrSystem() {
  if (!fs.existsSync(HR_SYSTEM_FILE)) {
    fs.writeFileSync(HR_SYSTEM_FILE, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(HR_SYSTEM_FILE, 'utf-8'));
}

function saveHrSystem(hrSystem) {
  fs.writeFileSync(HR_SYSTEM_FILE, JSON.stringify(hrSystem, null, 2));
}

// Agent registry format: { agent_id: { name, role, project, status, context_len, created_at } }
app.locals.loadHrSystem = loadHrSystem;
app.locals.saveHrSystem = saveHrSystem;

// ============================================================
// PROJECT ISOLATION - New project gets its own folder
// ============================================================

function createProjectFolder(projectId) {
  const projectDir = path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  return projectDir;
}

function getProjectFolder(projectId) {
  return path.join(PROJECTS_DIR, projectId);
}

function isGlobalScopeAgent(agentId, agentRole) {
  // Only CEO, HR, Staff Engineer, Solution Architect live in global scope
  const globalRoles = ['ceo-warlock', 'hr-mind-flayer', 'staff-engineer-paladin', 'wizard-solution-architect'];
  return globalRoles.includes(agentRole);
}

// ============================================================
// AGENT MESSAGE FILES - Per-agent JSON for inter-agent communication
// Format: { messages: [{ from, project, request, path, timestamp }] }
// ============================================================

function getAgentMessageFile(agentId) {
  return path.join(HR_SYSTEM_DIR, `agent-${agentId}.msgs.json`);
}

function loadAgentMessages(agentId) {
  const file = getAgentMessageFile(agentId);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ messages: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function appendAgentMessage(agentId, { from, project, request, path: filePath }) {
  const messages = loadAgentMessages(agentId);
  messages.messages.push({
    from,
    project,
    request,
    path: filePath,
    timestamp: new Date().toISOString(),
  });
  fs.writeFileSync(getAgentMessageFile(agentId), JSON.stringify(messages, null, 2));
}

// ============================================================
// SHARED CHANNEL / STATE LOG - Fallback and audit log
// All agents can log messages here
// ============================================================

function getSharedStateLogFile() {
  return path.join(SHARED_STATE_DIR, 'shared-state.log');
}

function appendToSharedLog(message) {
  const logEntry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(getSharedStateLogFile(), logEntry);
}

// ============================================================
// HARNESS INTEGRATION - Abstract functions with TODO comments
// ============================================================

// TODO: Research harness integration patterns from:
// - twaldin/harness (Python unified interface)
// - dvsaikumar/agents-harness (multi-harness plugin marketplace)
// - AgentField docs for opencode/gemini/codex/claudecode

// Abstract function signature for spawning any harness agent
// Returns: { process, agentId, harness, workdir, status }

// Opencode harness integration
function spawnOpencodeAgent(projectId, prompt, agentId) {
  const projectDir = getProjectFolder(projectId);
  const harnessBin = findHarnessBinary('opencode');

  if (!harnessBin) {
    throw new Error('OpenCode binary not found. Please install opencode or set opencode_bin path.');
  }

  try {
    const cmd = `${harnessBin} --dir ${projectDir} --model sonnet "${prompt}"`;
    const output = execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 120000 });
    return { success: true, output, agentId, harness: 'opencode' };
  } catch (error) {
    return { success: false, error: error.message, agentId, harness: 'opencode' };
  }
}

// Claudecode harness integration
function spawnClaudeCodeAgent(projectId, prompt, agentId) {
  const projectDir = getProjectFolder(projectId);
  const harnessBin = findHarnessBinary('claude-code');

  if (!harnessBin) {
    throw new Error('Claude Code binary not found. Please install claude-code or set claude-code_bin path.');
  }

  try {
    const cmd = `${harnessBin} -p "${prompt}" --workdir ${projectDir}`;
    const output = execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 120000 });
    return { success: true, output, agentId, harness: 'claude-code' };
  } catch (error) {
    return { success: false, error: error.message, agentId, harness: 'claude-code' };
  }
}

// Codex harness integration
function spawnCodexAgent(projectId, prompt, agentId) {
  const projectDir = getProjectFolder(projectId);
  const harnessBin = findHarnessBinary('codex');

  if (!harnessBin) {
    throw new Error('Codex binary not found. Please install codex or set codex_bin path.');
  }

  try {
    const cmd = `${harnessBin} --dir ${projectDir} "${prompt}"`;
    const output = execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 120000 });
    return { success: true, output, agentId, harness: 'codex' };
  } catch (error) {
    return { success: false, error: error.message, agentId, harness: 'codex' };
  }
}

// Gemini CLI harness integration
function spawnGeminiAgent(projectId, prompt, agentId) {
  const projectDir = getProjectFolder(projectId);
  const harnessBin = findHarnessBinary('gemini');

  if (!harnessBin) {
    throw new Error('Gemini CLI binary not found. Please install gemini-cli or set gemini_bin path.');
  }

  try {
    const cmd = `${harnessBin} --model gemini-2.5-pro --dir ${projectDir} "${prompt}"`;
    const output = execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 120000 });
    return { success: true, output, agentId, harness: 'gemini' };
  } catch (error) {
    return { success: false, error: error.message, agentId, harness: 'gemini' };
  }
}

// Generic harness spawner - dispatches to correct harness
function spawnHarnessAgent(harness, projectId, prompt, agentId) {
  switch (harness) {
    case 'opencode':
      return spawnOpencodeAgent(projectId, prompt, agentId);
    case 'claude-code':
      return spawnClaudeCodeAgent(projectId, prompt, agentId);
    case 'codex':
      return spawnCodexAgent(projectId, prompt, agentId);
    case 'gemini':
      return spawnGeminiAgent(projectId, prompt, agentId);
    default:
      throw new Error(`Unknown harness: ${harness}`);
  }
}

// Find harness binary in PATH or configured location
function findHarnessBinary(harnessName) {
  const binaryMap = {
    opencode: 'opencode',
    'claude-code': 'claude',
    codex: 'codex',
    gemini: 'gemini',
  };

  const possibleNames = binaryMap[harnessName];
  if (!possibleNames) return null;

  // Check if single binary or array
  const names = Array.isArray(possibleNames) ? possibleNames : [possibleNames];

  for (const name of names) {
    try {
      const result = execSync(`which ${name}`, { encoding: 'utf-8' });
      if (result.trim()) {
        return result.trim();
      }
    } catch (e) {
      // binary not found, continue
    }
  }

  return null;
}

// ============================================================
// AGENT SPAWN DECISION LOGIC
// ============================================================

/**
 * Decide whether to spawn a new agent based on the request type
 * @param {string} requestType - 'new-project', 'new-requirement', 'context-exhaustion'
 * @param {string} projectId - Project identifier
 * @param {string} agentRole - Desired agent role
 * @param {string} initiatedBy - 'ceo', 'manager', 'marshal'
 * @returns {object} Spawn decision with actions
 */
function decideSpawnAgent(requestType, projectId, agentRole, initiatedBy) {
  const hrSystem = loadHrSystem();

  switch (requestType) {
    case 'new-project':
      // CEO decides on new projects
      if (initiatedBy !== 'ceo') {
        return { allowed: false, reason: 'Only CEO can decide on new projects' };
      }
      // Create project folder and spawn Manager agent first
      createProjectFolder(projectId);
      appendToSharedLog(`CEO initiated new project: ${projectId}`);
      return { allowed: true, action: 'create-project-and-spawn-manager' };

    case 'new-requirement':
      // Manager decides on new requirements within existing project
      if (initiatedBy !== 'manager') {
        return { allowed: false, reason: 'Only Manager can decide on new requirements' };
      }
      // Check if manager exists for this project
      const managerId = hrSystem[`${projectId}-manager`];
      if (!managerId) {
        return { allowed: false, reason: 'No manager for this project. Create project first.' };
      }
      return { allowed: true, action: 'spawn-requested-agent' };

    case 'context-exhaustion':
      // Marshal detects context exhaustion and notifies Manager/HR
      appendToSharedLog(`Marshall detected context exhaustion for agent: ${agentId}`);
      return { allowed: true, action: 'notify-manager-and-hr' };

    default:
      return { allowed: false, reason: 'Unknown request type' };
  }
}

// ============================================================
// CONTEXT EXHAUSTION & STUCK PROCESS DETECTION
// ============================================================

/**
 * Check all agents for context window exhaustion
 * @param {object} hrSystem - Current HR system state
 * @returns {object} Results of context checks
 */
function checkContextExhaustion(hrSystem) {
  const results = { exhausted: [], warnings: [] };

  for (const [agentId, agent] of Object.entries(hrSystem)) {
    // TODO: Implement actual context length check
    // Compare agent.context_len vs actual usage
    // This would require reading agent's work context/memory
    if (agent.context_len && agent.context_len < 2000) {
      results.exhausted.push(agentId);
    } else {
      results.warnings.push(agentId);
    }
  }

  return results;
}

/**
 * Check for stuck processes (no progress in last 10 minutes)
 * @param {object} hrSystem - Current HR system state
 * @param {number} thresholdMinutes - 10 minutes default
 * @returns {object} Results of stuck process checks
 */
function checkStuckProcesses(hrSystem, thresholdMinutes = 10) {
  const results = { stuck: [], active: [] };
  const thresholdMs = thresholdMinutes * 60 * 1000;
  const now = Date.now();

  for (const [agentId, agent] of Object.entries(hrSystem)) {
    const lastActivity = agent.last_activity_ms || 0;
    if (now - lastActivity > thresholdMs) {
      results.stuck.push(agentId);
    } else {
      results.active.push(agentId);
    }
  }

  return results;
}

// ============================================================
// OBSOLETE AGENT CLEANUP
// ============================================================

/**
 * Verify if an agent is truly obsolete by reading its work log
 * An agent is obsolete if all its tracked tasks are complete
 * @param {string} agentId - Agent identifier
 * @returns {boolean} True if agent can be safely removed
 */
function verifyAgentObsolete(agentId) {
  // Read the agent's work log from its project folder
  // TODO: Implement work log reading from agent's project directory
  // Check if all tasks marked as done/complete
  // If had 10 tasks and all 10 are done -> safe to let agent go

  // Placeholder: For now, assume not obsolete
  return false;
}

/**
 * Clean up obsolete agent data from HR system and project folders
 * @param {string} agentId - Agent to potentially remove
 * @returns {object} Cleanup result
 */
function cleanupObsoleteAgent(agentId) {
  const hrSystem = loadHrSystem();

  if (!hrSystem[agentId]) {
    return { success: false, reason: 'Agent not found in HR system' };
  }

  // Verify agent is truly obsolete
  const isObsolete = verifyAgentObsolete(agentId);

  if (!isObsolete) {
    return { success: false, reason: 'Agent has unfinished work. Cannot remove.' };
  }

  // Remove from HR system
  delete hrSystem[agentId];
  saveHrSystem(hrSystem);

  // TODO: Clean up agent's project folder and message files
  appendToSharedLog(`Obsolete agent removed: ${agentId}`);

  return { success: true, agentId };
}

// ============================================================
// MARSHALL AGENT - Health checks (runs every 5 minutes)
// ============================================================

/**
 * Marshall agent - runs periodic health checks
 * Checks:
 * 1. Obsolete agents
 * 2. Context exhaustion
 * 3. Stuck processes (10-min threshold)
 * 4. Triggers handover if needed
 */
function runMarshallChecks() {
  const hrSystem = loadHrSystem();

  // Check for obsolete agents
  for (const agentId of Object.keys(hrSystem)) {
    cleanupObsoleteAgent(agentId);
  }

  // Check context exhaustion
  const contextCheck = checkContextExhaustion(hrSystem);
  if (contextCheck.exhausted.length > 0) {
    appendToSharedLog(`Context exhaustion detected for: ${contextCheck.exhausted.join(', ')}`);
    // TODO: Notify Manager and HR to spawn new processes
  }

  // Check for stuck processes
  const stuckCheck = checkStuckProcesses(hrSystem);
  if (stuckCheck.stuck.length > 0) {
    appendToSharedLog(`Stuck processes detected: ${stuckCheck.stuck.join(', ')}`);
    // TODO: Notify Manager for human-in-the-loop intervention
  }
}

// ============================================================
// FRONTEND SERVING
// ============================================================

// Serve the frontend HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(APP_DIR, 'frontend.html'));
});

// Serve static assets from the app directory
app.use(express.static(APP_DIR));

// ============================================================
// API ENDPOINTS
// ============================================================

/**
 * Handle frontend request to start a new project
 * @param {object} req - Express request with { projectId, initialAgentRole }
 * @param {object} res - Express response
 */
app.post('/handleStartProject', (req, res) => {
  const { projectId, initialAgentRole } = req.body;
  const result = decideSpawnAgent('new-project', projectId, initialAgentRole, 'ceo');

  if (!result.allowed) {
    return res.status(400).json({ error: result.reason });
  }

  // Create project folder
  createProjectFolder(projectId);

  return res.json({ success: true, action: result.action });
});

/**
 * Handle frontend request to send message to agent
 * @param {object} req - Express request with { agentId, projectId, message }
 * @param {object} res - Express response
 */
app.post('/handleSendMessage', (req, res) => {
  const { agentId, projectId, message } = req.body;
  appendAgentMessage(agentId, {
    from: 'frontend',
    project: projectId,
    request: message,
    path: getProjectFolder(projectId),
  });
  appendToSharedLog(`Message from frontend to agent ${agentId}: ${message.substring(0, 50)}...`);

  // TODO: Spawn agent harness with the message as prompt
  return res.json({ success: true });
});

/**
 * Handle frontend request to get agent status/messages
 * @param {object} req - Express request with { agentId }
 * @param {object} res - Express response
 */
app.post('/handleGetAgentStatus', (req, res) => {
  const { agentId } = req.body;
  const hrSystem = loadHrSystem();
  const messages = loadAgentMessages(agentId);
  const agent = hrSystem[agentId];

  return res.json({
    agent,
    messages: messages.messages,
  });
});

/**
 * Handle frontend request to get shared state log
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
app.post('/handleGetSharedLog', (req, res) => {
  const logFile = getSharedStateLogFile();
  if (!fs.existsSync(logFile)) {
    return res.json({ log: [] });
  }
  const content = fs.readFileSync(logFile, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  return res.json({ log: lines });
});

// ============================================================
// MARSHALL AGENT SCHEDULER
// ============================================================

// Run marsh checks every 5 minutes
setInterval(() => {
  runMarshallChecks();
  console.log('Marshall checks performed');
}, 300000); // 5 minutes in milliseconds

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(`=== DND Multi-Agent System ===`);
  console.log(`Backend API running at: http://localhost:${PORT}`);
  console.log(`Frontend available at: http://localhost:${PORT}`);
  console.log(`================================`);
  console.log(`API Endpoints:`);
  console.log(`  POST /handleStartProject - Start new project`);
  console.log(`  POST /handleSendMessage - Send message to agent`);
  console.log(`  POST /handleGetAgentStatus - Get agent status/messages`);
  console.log(`  POST /handleGetSharedLog - Get shared state log`);
  console.log(``);
  console.log(`Frontend: frontend.html with `);
  console.log(`  - Project tabs (Project 1, 2, 3)`);
  console.log(`  - 5-tab agent info panel (Chat, Stats, Thought, Context, Relationships)`);
  console.log(`  - Agent avatars in play area`);
  console.log(`  - Chat input at bottom`);
});

export { app };