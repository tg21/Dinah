import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { exec, execSync } from 'child_process';
import os from 'os';

// ============================================================
// EXPRESS APP & DIRECTORY CONFIGURATION
// ============================================================

const app = express();
const PORT = process.env.PORT || 2121;
const APP_DIR = process.cwd();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const HR_SYSTEM_DIR = path.join(APP_DIR, 'hr-system');
const AGENT_TEMPLATES_DIR = path.join(APP_DIR, 'agent-templates');
const SHARED_STATE_DIR = path.join(APP_DIR, 'shared-state');
const PROJECTS_DIR = path.join(APP_DIR, 'projects');

function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirExists(HR_SYSTEM_DIR);
ensureDirExists(AGENT_TEMPLATES_DIR);
ensureDirExists(SHARED_STATE_DIR);
ensureDirExists(PROJECTS_DIR);

// ============================================================
// D&D RPG STATS DATABASE & TEMPLATE DEFAULTS
// ============================================================

const AGENT_RPG_REGISTRY = {
  'ceo-warlock': {
    name: 'CEO Warlock',
    role: 'ceo-warlock',
    class: 'Warlock (Pact of the Board)',
    level: 20,
    hp: 140,
    maxHp: 140,
    ac: 18,
    avatarColor: 0x9b59b6,
    stats: { STR: 10, DEX: 14, CON: 16, INT: 16, WIS: 14, CHA: 20 },
    spells: [
      { name: 'Eldritch Executive Order', dice: '4d10+5', desc: 'Directs all company resources toward strategic initiative.' },
      { name: 'Pact of the Stock Option', dice: '2d8+5', desc: 'Inspires subordinate agents with long-term vesting promises.' },
      { name: 'Mystic Arcanum: Seed Round', dice: '8d6', desc: 'Summons sudden massive budget allocation.' }
    ],
    inventory: ['Staff of Executive Authority', 'Robes of the Boardroom', 'Tome of OKRs'],
    traits: ['Eldritch Presence', 'Dark One\'s Blessing', 'Unquestioned Authority']
  },
  'hr-mind-flayer': {
    name: 'HR Mind Flayer',
    role: 'hr-mind-flayer',
    class: 'Illithid Controller',
    level: 18,
    hp: 125,
    maxHp: 125,
    ac: 17,
    avatarColor: 0x8e44ad,
    stats: { STR: 12, DEX: 14, CON: 14, INT: 20, WIS: 18, CHA: 17 },
    spells: [
      { name: 'Mind Blast (Review)', dice: '5d8+5', desc: 'Stuns low-performing agents into total compliance.' },
      { name: 'Psionic Agent Spawning', dice: 'Special', desc: 'Reads markdown templates and manifests active agents.' },
      { name: 'Extract Morale', dice: '3d10+4', desc: 'Replaces emotional burnout with relentless output.' }
    ],
    inventory: ['Psionic Registry Tome', 'Tentacle Grooming Kit', 'Severance Package Scroll'],
    traits: ['Telepathic Network', 'Sole Agent Spawner', 'Magic Resistance']
  },
  'manager-bard': {
    name: 'Manager Bard',
    role: 'manager-bard',
    class: 'Bard (College of Agile)',
    level: 15,
    hp: 105,
    maxHp: 105,
    ac: 15,
    avatarColor: 0xe67e22,
    stats: { STR: 10, DEX: 16, CON: 14, INT: 14, WIS: 12, CHA: 19 },
    spells: [
      { name: 'Vicious Mockery', dice: '3d4', desc: 'Deals psychic damage to blockers during standup.' },
      { name: 'Bardic Sprint Inspiration', dice: '1d10', desc: 'Grants +1d10 to engineer prompt execution rolls.' },
      { name: 'Song of Restructuring', dice: '2d8+4', desc: 'Reallocates sprint story points effortlessly.' }
    ],
    inventory: ['Lute of Jira', 'Polished Slide Deck', 'Venti Latte of Urgency'],
    traits: ['Jack of All Trades', 'Agile Routing', 'Charismatic Deflection']
  },
  'solution-architect-wizard': {
    name: 'Solution Architect Wizard',
    role: 'solution-architect-wizard',
    class: 'Wizard (School of Architecture)',
    level: 16,
    hp: 85,
    maxHp: 85,
    ac: 14,
    avatarColor: 0x3498db,
    stats: { STR: 8, DEX: 14, CON: 13, INT: 20, WIS: 16, CHA: 10 },
    spells: [
      { name: 'Arcane Blueprint', dice: '4d6+5', desc: 'Draws flawless microservice diagrams.' },
      { name: 'Divination: Tech Debt', dice: '3d8', desc: 'Foresees breaking API changes months ahead.' },
      { name: 'Wall of Abstraction', dice: '5d10', desc: 'Blocks messy quick-hack implementations.' }
    ],
    inventory: ['Spellbook of Distributed Systems', 'Wand of Schema Design', 'Crystal of Latency Optimization'],
    traits: ['Arcane Recovery', 'Deep Spec Analysis', 'Theoretical Mastery']
  },
  'staff-engineer-paladin': {
    name: 'Staff Engineer Paladin',
    role: 'staff-engineer-paladin',
    class: 'Paladin (Oath of Clean Code)',
    level: 15,
    hp: 130,
    maxHp: 130,
    ac: 20,
    avatarColor: 0xf1c40f,
    stats: { STR: 18, DEX: 10, CON: 16, INT: 14, WIS: 14, CHA: 16 },
    spells: [
      { name: 'Divine Smite (Code Review)', dice: '4d8', desc: 'Banishes type violations and memory leaks.' },
      { name: 'Aura of Clean Code', dice: 'Passive', desc: '+3 maintainability bonus to all nearby devs.' },
      { name: 'Lay on Hands (Refactor)', dice: '50 HP', desc: 'Restores legacy spaghetti code to pristine shape.' }
    ],
    inventory: ['Greatsword of Strict Linting', 'Plate Armor of SOLID Principles', 'Holy Symbol of GitHub'],
    traits: ['Divine Sense of Tech Debt', 'Code Righteousness', 'Aura of Protection']
  },
  'backend-dev-cleric': {
    name: 'Backend Dev Cleric',
    role: 'backend-dev-cleric',
    class: 'Cleric (Domain of Persistence)',
    level: 12,
    hp: 98,
    maxHp: 98,
    ac: 18,
    avatarColor: 0x1abc9c,
    stats: { STR: 14, DEX: 10, CON: 15, INT: 14, WIS: 18, CHA: 10 },
    spells: [
      { name: 'Prayer of Schema Migration', dice: '3d8+4', desc: 'Lossless zero-downtime database update.' },
      { name: 'Turn Deadlocks', dice: 'Special', desc: 'Banishes race conditions across worker threads.' },
      { name: 'Bless REST Endpoint', dice: '1d4', desc: 'Sub-10ms response time blessing.' }
    ],
    inventory: ['Warhammer of SQL Queries', 'Shield of ACID Transactions', 'Vial of Connection Pool Holy Water'],
    traits: ['Divine Connection Pooling', 'Channel Energy (Query Opt)', 'Transaction Safeguard']
  },
  'frontend-dev-sorcerer': {
    name: 'Frontend Dev Sorcerer',
    role: 'frontend-dev-sorcerer',
    class: 'Sorcerer (Wild Magic of CSS)',
    level: 12,
    hp: 78,
    maxHp: 78,
    ac: 13,
    avatarColor: 0xe91e63,
    stats: { STR: 8, DEX: 16, CON: 14, INT: 12, WIS: 10, CHA: 18 },
    spells: [
      { name: 'Wild Magic Surge (Flexbox)', dice: '3d6+4', desc: 'Instantly centers div in all dimensions.' },
      { name: 'PixiJS Canvas Summoning', dice: '4d8', desc: 'Renders 60FPS GPU accelerated canvas.' },
      { name: 'Twinned Responsive Layout', dice: '2d10', desc: 'Seamless mobile and desktop rendering.' }
    ],
    inventory: ['Orb of WebGL Shaders', 'Cloak of Visual Aesthetics', 'Figma Color Swatch Wand'],
    traits: ['Wild Magic Surge', 'Flexible Casting', 'Responsive Intuition']
  },
  'qa-engineer-rogue': {
    name: 'QA Engineer Rogue',
    role: 'qa-engineer-rogue',
    class: 'Rogue (Assassin of Edge Cases)',
    level: 13,
    hp: 88,
    maxHp: 88,
    ac: 16,
    avatarColor: 0x27ae60,
    stats: { STR: 10, DEX: 20, CON: 14, INT: 15, WIS: 14, CHA: 12 },
    spells: [
      { name: 'Sneak Attack (Null Injection)', dice: '7d6', desc: 'Passes undefined into unsuspecting arguments.' },
      { name: 'Evasion of Blame', dice: 'Reaction', desc: 'Dodges defensive dev excuses on broken builds.' },
      { name: 'Uncanny Edge Case Detection', dice: '3d8', desc: 'Finds single boundary overflow bug.' }
    ],
    inventory: ['Daggers of Boundary Testing', 'Smoke Bomb of Regression Tests', 'Lockpicks of Auth Bypass'],
    traits: ['Sneak Attack', 'Cunning Action', 'Reliable Bug Talent']
  },
  'marshall-agent-system-inspector': {
    name: 'Marshall Agent',
    role: 'marshall-agent-system-inspector',
    class: 'Inquisitive Sentinel / Inspector',
    level: 15,
    hp: 120,
    maxHp: 120,
    ac: 18,
    avatarColor: 0x00bcd4,
    stats: { STR: 14, DEX: 14, CON: 16, INT: 18, WIS: 20, CHA: 12 },
    spells: [
      { name: 'Detect Obsolete Workers', dice: 'Scry', desc: 'Scans work logs for 100% completed tasks.' },
      { name: 'Context Window Scrying', dice: 'Telemetry', desc: 'Measures token consumption and triggers handovers.' },
      { name: 'Freeze Stalled Process', dice: 'Special', desc: 'Flags 10-minute stuck processes for human review.' }
    ],
    inventory: ['Badge of the System Marshall', 'Hourglass of 5-Minute Checks', 'Ledger of Active Processes'],
    traits: ['Watchdog Senses', 'Context Clairvoyance', 'Automated Health Protocol']
  }
};

// ============================================================
// HR SYSTEM REGISTRY
// ============================================================

const HR_SYSTEM_FILE = path.join(HR_SYSTEM_DIR, 'hr-system.json');

function loadHrSystem() {
  if (!fs.existsSync(HR_SYSTEM_FILE)) {
    const initialRegistry = {
      'ceo-warlock': {
        name: 'CEO Warlock',
        role: 'ceo-warlock',
        project: 'global',
        status: 'active',
        context_len: 128000,
        context_used: 12400,
        created_at: new Date().toISOString(),
        last_activity_ms: Date.now(),
        stats: AGENT_RPG_REGISTRY['ceo-warlock']
      },
      'hr-mind-flayer': {
        name: 'HR Mind Flayer',
        role: 'hr-mind-flayer',
        project: 'global',
        status: 'active',
        context_len: 128000,
        context_used: 8200,
        created_at: new Date().toISOString(),
        last_activity_ms: Date.now(),
        stats: AGENT_RPG_REGISTRY['hr-mind-flayer']
      },
      'staff-engineer-paladin': {
        name: 'Staff Engineer Paladin',
        role: 'staff-engineer-paladin',
        project: 'global',
        status: 'active',
        context_len: 128000,
        context_used: 9500,
        created_at: new Date().toISOString(),
        last_activity_ms: Date.now(),
        stats: AGENT_RPG_REGISTRY['staff-engineer-paladin']
      }
    };
    fs.writeFileSync(HR_SYSTEM_FILE, JSON.stringify(initialRegistry, null, 2));
    return initialRegistry;
  }
  try {
    const data = JSON.parse(fs.readFileSync(HR_SYSTEM_FILE, 'utf-8'));
    // Ensure the 3 global agents exist
    if (!data['staff-engineer-paladin']) {
      data['staff-engineer-paladin'] = {
        name: 'Staff Engineer Paladin',
        role: 'staff-engineer-paladin',
        project: 'global',
        status: 'active',
        context_len: 128000,
        context_used: 9500,
        created_at: new Date().toISOString(),
        last_activity_ms: Date.now(),
        stats: AGENT_RPG_REGISTRY['staff-engineer-paladin']
      };
      fs.writeFileSync(HR_SYSTEM_FILE, JSON.stringify(data, null, 2));
    }
    return data;
  } catch (e) {
    return {};
  }
}

function saveHrSystem(hrSystem) {
  fs.writeFileSync(HR_SYSTEM_FILE, JSON.stringify(hrSystem, null, 2));
}

// ============================================================
// PROJECT ISOLATION
// ============================================================

function createProjectFolder(projectId) {
  const projectDir = path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    // Add default initial project readme
    const readmePath = path.join(projectDir, 'README.md');
    fs.writeFileSync(readmePath, `# Project: ${projectId}\n\nInitiated by CEO Warlock.\nManaged by Manager Bard.\n`);
  }
  return projectDir;
}

function getProjectFolder(projectId) {
  return path.join(PROJECTS_DIR, projectId || 'project-alpha');
}

function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => e.name);
}

// ============================================================
// AGENT MESSAGE LOGS & THOUGHT STREAM
// ============================================================

function getAgentMessageFile(agentId) {
  return path.join(HR_SYSTEM_DIR, `agent-${agentId}.msgs.json`);
}

function getAgentThoughtFile(agentId) {
  return path.join(HR_SYSTEM_DIR, `agent-${agentId}.thoughts.json`);
}

function loadAgentMessages(agentId) {
  const file = getAgentMessageFile(agentId);
  if (!fs.existsSync(file)) {
    const initialData = { messages: [] };
    fs.writeFileSync(file, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return { messages: [] };
  }
}

function appendAgentMessage(agentId, { from, project, request, path: filePath, role = 'agent' }) {
  const messages = loadAgentMessages(agentId);
  messages.messages.push({
    from,
    role,
    project,
    request,
    path: filePath,
    timestamp: new Date().toISOString(),
  });
  fs.writeFileSync(getAgentMessageFile(agentId), JSON.stringify(messages, null, 2));
}

function loadAgentThoughts(agentId) {
  const file = getAgentThoughtFile(agentId);
  if (!fs.existsSync(file)) {
    return [
      { timestamp: new Date().toISOString(), step: 'IDLE', thought: 'Awaiting instructions or initiative from leadership.' }
    ];
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function appendAgentThought(agentId, step, thought) {
  const file = getAgentThoughtFile(agentId);
  let thoughts = [];
  if (fs.existsSync(file)) {
    try {
      thoughts = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      thoughts = [];
    }
  }
  thoughts.push({
    timestamp: new Date().toISOString(),
    step,
    thought
  });
  // Keep last 50 thoughts
  if (thoughts.length > 50) thoughts = thoughts.slice(-50);
  fs.writeFileSync(file, JSON.stringify(thoughts, null, 2));
}

// ============================================================
// SHARED CHANNEL / AUDIT LOG
// ============================================================

function getSharedStateLogFile() {
  return path.join(SHARED_STATE_DIR, 'shared-state.log');
}

function appendToSharedLog(message) {
  const logEntry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(getSharedStateLogFile(), logEntry);
}

// ============================================================
// HARNESS DETECTION & EXECUTION
// ============================================================

function findHarnessBinary(harnessName) {
  const binaryMap = {
    opencode: ['opencode', '/usr/bin/opencode', '/usr/local/bin/opencode'],
    'claude-code': ['claude', 'claude-code'],
    codex: ['codex', 'openai'],
    gemini: ['gemini', 'gemini-cli']
  };

  const possibleNames = binaryMap[harnessName] || [harnessName];

  for (const name of possibleNames) {
    if (name.startsWith('/') && fs.existsSync(name)) {
      return name;
    }
    try {
      const result = execSync(`which ${name} 2>/dev/null`, { encoding: 'utf-8' });
      if (result && result.trim()) {
        return result.trim();
      }
    } catch (e) {
      // not found in path
    }
  }

  return null;
}

// Spawns OpenCode agent via CLI
function spawnOpencodeAgent(projectId, prompt, agentId) {
  const projectDir = getProjectFolder(projectId);
  createProjectFolder(projectId);
  const harnessBin = findHarnessBinary('opencode');

  if (!harnessBin) {
    return simulateHarnessExecution('opencode', projectId, prompt, agentId);
  }

  try {
    appendAgentThought(agentId, 'OPENCODE_INVOKE', `Invoking OpenCode harness in ${projectDir}`);
    // Sanitize prompt for command line
    const escapedPrompt = prompt.replace(/"/g, '\\"');
    const cmd = `${harnessBin} run --dir "${projectDir}" "${escapedPrompt}"`;
    const output = execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 5000 });
    appendAgentThought(agentId, 'OPENCODE_SUCCESS', `OpenCode execution completed.`);
    return { success: true, output, agentId, harness: 'opencode' };
  } catch (error) {
    // If CLI error or timeout, provide helpful fallback response
    appendAgentThought(agentId, 'OPENCODE_FALLBACK', `Harness returned: ${error.message.slice(0, 100)}`);
    return simulateHarnessExecution('opencode', projectId, prompt, agentId);
  }
}

// Spawns Claude Code agent
function spawnClaudeCodeAgent(projectId, prompt, agentId) {
  const projectDir = getProjectFolder(projectId);
  createProjectFolder(projectId);
  const harnessBin = findHarnessBinary('claude-code');

  if (!harnessBin) {
    return simulateHarnessExecution('claude-code', projectId, prompt, agentId);
  }

  try {
    const escapedPrompt = prompt.replace(/"/g, '\\"');
    const cmd = `${harnessBin} -p "${escapedPrompt}" --workdir "${projectDir}"`;
    const output = execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 5000 });
    return { success: true, output, agentId, harness: 'claude-code' };
  } catch (error) {
    return simulateHarnessExecution('claude-code', projectId, prompt, agentId);
  }
}

// Spawns Codex agent
function spawnCodexAgent(projectId, prompt, agentId) {
  const projectDir = getProjectFolder(projectId);
  createProjectFolder(projectId);
  const harnessBin = findHarnessBinary('codex');

  if (!harnessBin) {
    return simulateHarnessExecution('codex', projectId, prompt, agentId);
  }

  try {
    const escapedPrompt = prompt.replace(/"/g, '\\"');
    const cmd = `${harnessBin} --dir "${projectDir}" "${escapedPrompt}"`;
    const output = execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 5000 });
    return { success: true, output, agentId, harness: 'codex' };
  } catch (error) {
    return simulateHarnessExecution('codex', projectId, prompt, agentId);
  }
}

// Spawns Gemini agent
function spawnGeminiAgent(projectId, prompt, agentId) {
  const projectDir = getProjectFolder(projectId);
  createProjectFolder(projectId);
  const harnessBin = findHarnessBinary('gemini');

  if (!harnessBin) {
    return simulateHarnessExecution('gemini', projectId, prompt, agentId);
  }

  try {
    const escapedPrompt = prompt.replace(/"/g, '\\"');
    const cmd = `${harnessBin} --model gemini-2.5-pro --dir "${projectDir}" "${escapedPrompt}"`;
    const output = execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 30000 });
    return { success: true, output, agentId, harness: 'gemini' };
  } catch (error) {
    return simulateHarnessExecution('gemini', projectId, prompt, agentId);
  }
}

// Intelligent fallback & simulation when external harness is not configured or in sandbox
function simulateHarnessExecution(harness, projectId, prompt, agentId) {
  const hrSystem = loadHrSystem();
  const agent = hrSystem[agentId] || { name: agentId, role: agentId };
  
  let roleFlavor = '';
  if (agent.role.includes('ceo')) {
    roleFlavor = `[CEO Warlock]: I have received your strategic directive: "${prompt}". Delegating to HR Mind Flayer to ensure Manager Bard and project resources are allocated.`;
  } else if (agent.role.includes('hr')) {
    roleFlavor = `[HR Mind Flayer]: Compliance verified. Telepathically reviewing active agent roster and templates for project ${projectId}.`;
  } else if (agent.role.includes('manager')) {
    roleFlavor = `[Manager Bard]: Casting Vicious Mockery on project blockers! Breaking down "${prompt}" into sprint tickets for engineering and QA.`;
  } else if (agent.role.includes('wizard') || agent.role.includes('architect')) {
    roleFlavor = `[Solution Architect Wizard]: Drafting architectural blueprint and data schemas for "${prompt}".`;
  } else if (agent.role.includes('paladin') || agent.role.includes('staff')) {
    roleFlavor = `[Staff Engineer Paladin]: Enforcing the Sacred Oath of Clean Code. Inspecting interfaces and test requirements.`;
  } else if (agent.role.includes('cleric') || agent.role.includes('backend')) {
    roleFlavor = `[Backend Cleric]: Praying to PostgreSQL gods. Preparing database schema and REST controllers.`;
  } else if (agent.role.includes('sorcerer') || agent.role.includes('frontend')) {
    roleFlavor = `[Frontend Sorcerer]: Channeling PixiJS visual magic and responsive CSS layouts.`;
  } else if (agent.role.includes('rogue') || agent.role.includes('qa')) {
    roleFlavor = `[QA Rogue]: Lurking in the shadows with edge-case null pointers and regression suites.`;
  } else {
    roleFlavor = `[${agent.name || agentId}]: Processing directive "${prompt}" via harness [${harness}]. Task in progress.`;
  }

  appendAgentThought(agentId, 'REASONING', `Parsed directive for project ${projectId}. Applying role-specific D&D persona logic.`);
  appendAgentThought(agentId, 'EXECUTION', `Executed task plan. Outputting response.`);

  return {
    success: true,
    output: roleFlavor,
    agentId,
    harness,
    simulated: true
  };
}

function spawnHarnessAgent(harness = 'opencode', projectId, prompt, agentId) {
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
      return spawnOpencodeAgent(projectId, prompt, agentId);
  }
}

// ============================================================
// AGENT LIFECYCLE & HR SPAWNING
// ============================================================

/**
 * HR Mind Flayer exclusively spawns new agents
 */
function spawnAgentViaHr(role, projectId = 'global', customName = null) {
  const hrSystem = loadHrSystem();
  
  // Format agent ID
  const baseId = projectId === 'global' ? role : `${projectId}-${role}`;
  let agentId = baseId;
  let counter = 1;
  while (hrSystem[agentId]) {
    agentId = `${baseId}-${counter++}`;
  }

  // Load template info if exists
  const templateFile = path.join(AGENT_TEMPLATES_DIR, `${role}.md`);
  let templateContent = '';
  if (fs.existsSync(templateFile)) {
    templateContent = fs.readFileSync(templateFile, 'utf-8');
  }

  const rpgStats = AGENT_RPG_REGISTRY[role] || {
    name: customName || role.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    role,
    class: 'Specialist Agent',
    level: 10,
    hp: 80,
    maxHp: 80,
    ac: 15,
    avatarColor: 0x95a5a6,
    stats: { STR: 12, DEX: 12, CON: 12, INT: 14, WIS: 12, CHA: 12 },
    spells: [{ name: 'Execute Directive', dice: '2d8', desc: 'Performs role task.' }],
    inventory: ['Standard Issue Notebook', 'Access Keycard'],
    traits: ['Task Execution']
  };

  const newAgent = {
    name: customName || rpgStats.name,
    role,
    project: projectId,
    status: 'active',
    context_len: 128000,
    context_used: 1500,
    created_at: new Date().toISOString(),
    last_activity_ms: Date.now(),
    stats: rpgStats,
    tasks_total: 5,
    tasks_completed: 0
  };

  hrSystem[agentId] = newAgent;
  saveHrSystem(hrSystem);

  // Initialize message file
  appendAgentMessage(agentId, {
    from: 'hr-mind-flayer',
    project: projectId,
    request: `Agent ${newAgent.name} successfully spawned and assigned to ${projectId}. System prompt initialized from template.`,
    path: getProjectFolder(projectId),
    role: 'system'
  });

  appendAgentThought(agentId, 'INITIALIZE', `Spawned into project ${projectId} by HR Mind Flayer.`);
  appendToSharedLog(`HR Mind Flayer spawned agent [${agentId}] for project [${projectId}]`);

  return { agentId, agent: newAgent };
}

// ============================================================
// MARSHALL AGENT & HEALTH CHECK LOGIC
// ============================================================

function checkContextExhaustion(hrSystem) {
  const results = { exhausted: [], warnings: [] };
  for (const [agentId, agent] of Object.entries(hrSystem)) {
    const remaining = (agent.context_len || 128000) - (agent.context_used || 0);
    if (remaining < 5000) {
      results.exhausted.push({ agentId, remaining, limit: agent.context_len });
    } else if (remaining < 20000) {
      results.warnings.push({ agentId, remaining, limit: agent.context_len });
    }
  }
  return results;
}

function checkStuckProcesses(hrSystem, thresholdMinutes = 10) {
  const results = { stuck: [], active: [] };
  const thresholdMs = thresholdMinutes * 60 * 1000;
  const now = Date.now();

  for (const [agentId, agent] of Object.entries(hrSystem)) {
    const lastActivity = agent.last_activity_ms || 0;
    const diff = now - lastActivity;
    if (diff > thresholdMs && agent.status === 'working') {
      results.stuck.push({ agentId, idleMinutes: Math.round(diff / 60000) });
    } else {
      results.active.push(agentId);
    }
  }
  return results;
}

function verifyAndCleanupObsoleteAgents(hrSystem) {
  const cleaned = [];
  for (const [agentId, agent] of Object.entries(hrSystem)) {
    // Check if non-global worker has finished all tasks
    if (agent.project !== 'global' && agent.tasks_total > 0 && agent.tasks_completed >= agent.tasks_total) {
      agent.status = 'obsolete';
      appendToSharedLog(`Marshall Agent & HR verified completion for obsolete agent: ${agentId}`);
      delete hrSystem[agentId];
      cleaned.push(agentId);
    }
  }
  if (cleaned.length > 0) {
    saveHrSystem(hrSystem);
  }
  return cleaned;
}

function runMarshallChecks() {
  const hrSystem = loadHrSystem();
  appendToSharedLog('Marshall Agent running 5-minute system inspection...');

  // 1. Obsolete agents
  const cleaned = verifyAndCleanupObsoleteAgents(hrSystem);

  // 2. Context exhaustion
  const contextCheck = checkContextExhaustion(hrSystem);
  if (contextCheck.exhausted.length > 0) {
    appendToSharedLog(`[ALERT] Context exhaustion imminent for: ${contextCheck.exhausted.map(e => e.agentId).join(', ')}. Triggering handover recommendations.`);
  }

  // 3. Stuck processes
  const stuckCheck = checkStuckProcesses(hrSystem);
  if (stuckCheck.stuck.length > 0) {
    appendToSharedLog(`[WARN] Stuck processes detected: ${stuckCheck.stuck.map(s => `${s.agentId} (${s.idleMinutes}m)`).join(', ')}. Notifying Manager for human-in-the-loop review.`);
  }

  return {
    timestamp: new Date().toISOString(),
    cleaned,
    contextCheck,
    stuckCheck
  };
}

// Run Marshall checks every 5 minutes
setInterval(() => {
  runMarshallChecks();
}, 300000);

// ============================================================
// REST API ENDPOINTS
// ============================================================

// Serve Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(APP_DIR, 'frontend.html'));
});
app.use(express.static(APP_DIR));

// Get all projects
app.get('/api/projects', (req, res) => {
  const projects = listProjects();
  if (projects.length === 0) {
    createProjectFolder('project-alpha');
    createProjectFolder('project-beta');
  }
  res.json({ projects: listProjects() });
});

// Start new project (CEO Initiates -> HR spawns Manager Bard)
app.post('/handleStartProject', (req, res) => {
  const { projectId, initialAgentRole = 'manager-bard', prompt = 'Initial project setup' } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  createProjectFolder(projectId);
  appendToSharedLog(`CEO Warlock initiated new project: [${projectId}]`);

  // HR spawns Manager Bard for this project
  const spawned = spawnAgentViaHr(initialAgentRole, projectId, `Manager Bard (${projectId})`);

  return res.json({
    success: true,
    projectId,
    managerAgentId: spawned.agentId,
    message: `Project ${projectId} created. HR Mind Flayer spawned ${spawned.agentId}.`
  });
});

// Get all agents registry
app.get('/api/agents', (req, res) => {
  const hrSystem = loadHrSystem();
  res.json({ agents: hrSystem });
});

// HR Spawns a new agent
app.post('/api/agents/spawn', (req, res) => {
  const { role, projectId = 'global', customName } = req.body;
  if (!role) {
    return res.status(400).json({ error: 'Agent role is required' });
  }
  const result = spawnAgentViaHr(role, projectId, customName);
  res.json({ success: true, ...result });
});

// Get single agent status, character sheet, messages, thoughts, context
app.post('/handleGetAgentStatus', (req, res) => {
  const { agentId = 'ceo-warlock' } = req.body;
  const hrSystem = loadHrSystem();
  let agent = hrSystem[agentId];

  // If requested agent doesn't exist, create fallback or default
  if (!agent) {
    if (agentId === 'ceo-warlock' || agentId === 'hr-mind-flayer') {
      loadHrSystem(); // ensures initial file written
      agent = hrSystem[agentId];
    } else {
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

// Send message to agent -> executes harness -> appends reply
app.post('/handleSendMessage', (req, res) => {
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

  // 2. Update agent activity
  const hrSystem = loadHrSystem();
  if (hrSystem[agentId]) {
    hrSystem[agentId].last_activity_ms = Date.now();
    hrSystem[agentId].context_used = (hrSystem[agentId].context_used || 5000) + Math.round(message.length * 1.5);
    saveHrSystem(hrSystem);
  }

  // 3. Dispatch to harness
  appendAgentThought(agentId, 'USER_INPUT', `Received prompt: "${message.slice(0, 80)}..."`);
  const harnessResult = spawnHarnessAgent(harness, projectId, message, agentId);

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

// Get shared state log
app.post('/handleGetSharedLog', (req, res) => {
  const logFile = getSharedStateLogFile();
  if (!fs.existsSync(logFile)) {
    return res.json({ log: [] });
  }
  const content = fs.readFileSync(logFile, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  return res.json({ log: lines });
});

// Get network relationship graph
app.get('/api/relationships', (req, res) => {
  const hrSystem = loadHrSystem();
  const agents = Object.entries(hrSystem).map(([id, a]) => ({
    id,
    name: a.name || id,
    role: a.role || id,
    project: a.project || 'global',
    color: a.stats?.avatarColor || 0x9b59b6
  }));

  const links = [];
  // Build relationships based on messages and hierarchies
  for (const agentId of Object.keys(hrSystem)) {
    if (agentId !== 'ceo-warlock') {
      links.push({ source: 'ceo-warlock', target: agentId, value: 5 });
    }
    if (agentId !== 'hr-mind-flayer') {
      links.push({ source: 'hr-mind-flayer', target: agentId, value: 8 });
    }
  }

  res.json({ nodes: agents, links });
});

// Dynamic AI Agent Thoughts Pool
const ROLE_THOUGHT_POOLS = {
  'ceo-warlock': [
    "Consulting the Eldritch Board of Directors...",
    "Marinating on long-term enterprise strategy...",
    "Reviewing quarterly OKRs and burn rate...",
    "Evaluating executive resource allocation...",
    "Delegating new initiative to HR Mind Flayer..."
  ],
  'hr-mind-flayer': [
    "Psionically scanning agent roster...",
    "Measuring team morale and context limits...",
    "Reading markdown templates for optimal recruitment...",
    "Reviewing compliance and talent pipeline...",
    "Preparing psionic spawn protocol..."
  ],
  'staff-engineer-paladin': [
    "Enforcing the Sacred Oath of Clean Code...",
    "Pondering type safety and architectural boundaries...",
    "Inspecting system interfaces for tech debt...",
    "Reviewing PRs with divine discernment...",
    "Contemplating domain-driven design purity..."
  ],
  'manager-bard': [
    "Marinating on project requirements...",
    "Tuning the Lute of Jira...",
    "Organizing sprint backlog and routing tasks...",
    "Casting Bardic Inspiration on engineers...",
    "Resolving blocker with diplomatic charisma..."
  ],
  'solution-architect-wizard': [
    "Drafting arcane microservice blueprints...",
    "Divining distributed latency bottlenecks...",
    "Synthesizing data flow diagrams...",
    "Evaluating async event bus topology...",
    "Optimizing schema normalization runes..."
  ],
  'backend-dev-cleric': [
    "Praying to PostgreSQL gods for low latency...",
    "Brewing connection pool holy water...",
    "Migrating schemas with zero downtime...",
    "Banishing database deadlocks...",
    "Refactoring REST controllers and middleware..."
  ],
  'frontend-dev-sorcerer': [
    "Channeling wild magic into CSS flexbox...",
    "Marinating on responsive UI aesthetics...",
    "Summoning 60FPS PixiJS canvas shaders...",
    "Brewing glassmorphic gradients and animations...",
    "Fixing z-index dimension anomalies..."
  ],
  'qa-engineer-rogue': [
    "Lurking in shadows with null injection payloads...",
    "Stabbing code in edge-case boundary conditions...",
    "Executing stealth regression test suites...",
    "Hunting subtle off-by-one errors...",
    "Bypassing defensive developer excuses..."
  ],
  'devops-sre-dragonborn-warmage': [
    "Tanking explosive deployment fallout...",
    "Fortifying Kubernetes cluster perimeter...",
    "Monitoring Prometheus metrics and thermal spikes...",
    "Automating CI/CD pipeline incantations...",
    "Scaling server pods against traffic storm..."
  ],
  'marshall-agent-system-inspector': [
    "Scrying active processes for 100% completed tasks...",
    "Measuring agent context token telemetry...",
    "Inspecting system vital signs for stuck loops...",
    "Running scheduled 5-minute sentinel audit...",
    "Keeping the realm organized and healthy..."
  ]
};

// API: Get live thoughts for all agents
app.get('/api/agent-thoughts', (req, res) => {
  const hrSystem = loadHrSystem();
  const thoughtsMap = {};
  for (const [agentId, agent] of Object.entries(hrSystem)) {
    const role = agent.role || 'manager-bard';
    const rolePool = ROLE_THOUGHT_POOLS[role] || [
      "Processing task directives...",
      "Marinating on optimal approach...",
      "Analyzing project context..."
    ];
    const loggedThoughts = loadAgentThoughts(agentId);
    const lastThought = loggedThoughts.length > 0 ? loggedThoughts[loggedThoughts.length - 1].thought : null;
    const randomThought = rolePool[Math.floor(Math.random() * rolePool.length)];
    thoughtsMap[agentId] = {
      agentId,
      name: agent.name || agentId,
      role: agent.role,
      project: agent.project,
      currentThought: lastThought || randomThought,
      thoughtPool: rolePool
    };
  }
  res.json({ thoughts: thoughtsMap });
});

// Trigger manual Marshall Health Check
app.post('/api/marshall/run', (req, res) => {
  const report = runMarshallChecks();
  res.json({ success: true, report });
});

// ============================================================
// SERVER INITIALIZATION
// ============================================================

// Initialize base agents on startup
loadHrSystem();
createProjectFolder('project-alpha');
createProjectFolder('project-beta');

// Ensure ONLY manager exists for project-alpha (No other agents spawned by default)
const initialHr = loadHrSystem();
if (!initialHr['project-alpha-manager-bard']) {
  spawnAgentViaHr('manager-bard', 'project-alpha', 'Manager Bard (Alpha)');
}

// Clean up any old pre-spawned worker agents from previous test runs if needed
for (const [id, agent] of Object.entries(initialHr)) {
  if (agent.project === 'project-alpha' && id !== 'project-alpha-manager-bard') {
    delete initialHr[id];
  }
}
saveHrSystem(initialHr);

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🏰 DND Multi-Agent System Server is LIVE`);
  console.log(`🌐 Web UI: http://localhost:${PORT}`);
  console.log(`⚡ Harness Binary (OpenCode): ${findHarnessBinary('opencode') || 'Simulated/Fallback'}`);
  console.log(`🛡️ Marshall Watchdog Cycle: Active (every 5 mins)`);
  console.log(`====================================================`);
});

export { app };