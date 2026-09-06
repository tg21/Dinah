import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, execSync, execFileSync, spawn } from 'child_process';
import {
  initializeHarnessesAndModels,
  getAvailableModels,
  getDetectedHarnesses,
  getModelById,
  selectBestModelForRole,
  findHarnessBinary
} from './harnessRegistry.js';

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
const PROMPTS_DIR = path.join(APP_DIR, 'prompts');
const SHARED_STATE_DIR = path.join(APP_DIR, 'shared-state');
const PROJECTS_DIR = path.join(APP_DIR, 'projects');
const MCP_DIR = path.join(APP_DIR, 'mcp');
const MCP_SERVERS_DIR = path.join(MCP_DIR, 'servers');
const MCP_REGISTRY_FILE = path.join(MCP_DIR, 'registry.json');
const MCP_CATALOG_URL = process.env.MCP_REGISTRY_URL || 'https://registry.modelcontextprotocol.io';
const PROJECTS_CONFIG_FILE = path.join(PROJECTS_DIR, 'projects-config.json');
const KNOWLEDGE_BASE_FILE = path.join(SHARED_STATE_DIR, 'knowledge-base.json');
const MARSHALL_AUDIT_FILE = path.join(SHARED_STATE_DIR, 'marshall-audit.json');
const STARTUP_SETUP_FILE = path.join(SHARED_STATE_DIR, 'startup-setup.json');
const STARTUP_SELECTION_AUDIT_FILE = path.join(SHARED_STATE_DIR, 'startup-model-selection.json');
const TOP_LEVEL_AGENT_IDS = [
  'hr-mind-flayer',
  'staff-engineer-paladin',
  'senior-analyst-diviner',
  'marshall-agent-system-inspector'
];

function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirExists(HR_SYSTEM_DIR);
ensureDirExists(AGENT_TEMPLATES_DIR);
ensureDirExists(PROMPTS_DIR);
ensureDirExists(SHARED_STATE_DIR);
ensureDirExists(PROJECTS_DIR);
ensureDirExists(MCP_DIR);
ensureDirExists(MCP_SERVERS_DIR);

// ============================================================
// SHARED MCP REGISTRY & PER-AGENT TOOL PERMISSIONS
// ============================================================

function loadMcpRegistry() {
  if (!fs.existsSync(MCP_REGISTRY_FILE)) {
    fs.writeFileSync(MCP_REGISTRY_FILE, JSON.stringify({ mcps: [] }, null, 2));
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(MCP_REGISTRY_FILE, 'utf-8'));
    return Array.isArray(data) ? data : (data.mcps || []);
  } catch (e) {
    console.error('Unable to read MCP registry:', e.message);
    return [];
  }
}

function saveMcpRegistry(mcps) {
  fs.writeFileSync(MCP_REGISTRY_FILE, JSON.stringify({ mcps }, null, 2));
}

function normaliseCatalogServer(item) {
  const server = item?.server || item;
  if (!server?.name) return null;
  const packages = server.packages || [];
  return {
    name: server.name,
    description: server.description || '',
    version: server.version || packages[0]?.version || 'latest',
    repository: server.repository || null,
    websiteUrl: server.websiteUrl || server.documentationUrl || null,
    packages: packages.map(pkg => ({
      registryType: pkg.registryType,
      identifier: pkg.identifier,
      version: pkg.version,
      transport: pkg.transport,
      runtimeArguments: pkg.runtimeArguments || [],
      packageArguments: pkg.packageArguments || []
    }))
  };
}

async function searchMcpCatalog(query) {
  const url = new URL('/v0.1/servers', MCP_CATALOG_URL);
  url.searchParams.set('version', 'latest');
  url.searchParams.set('limit', '30');
  if (query) url.searchParams.set('search', query.slice(0, 120));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MCP registry returned HTTP ${response.status}`);
  const data = await response.json();
  return (data.servers || [])
    .map(normaliseCatalogServer)
    .filter(server => server && getInstallableNpmPackage(server));
}

function safeMcpSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

function packageNameIsSafe(value) {
  return typeof value === 'string' && /^(?:@[^/]+\/)?[a-zA-Z0-9._~-]+$/.test(value);
}

function getInstallableNpmPackage(server) {
  return server?.packages?.find(pkg => pkg.registryType === 'npm' && packageNameIsSafe(pkg.identifier)) || null;
}

function installedPackageDirectory(targetDir, packageName) {
  return path.join(targetDir, 'node_modules', ...packageName.split('/'));
}

function resolveInstalledMcpCommand(targetDir, packageName) {
  const packageJsonPath = path.join(installedPackageDirectory(targetDir, packageName), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const bin = typeof packageJson.bin === 'string'
    ? path.basename(packageJson.name || packageName)
    : Object.keys(packageJson.bin || {})[0];
  if (!bin) throw new Error(`Installed MCP package ${packageName} does not expose a command-line entry point`);
  return path.join(targetDir, 'node_modules', '.bin', bin);
}

function discoverMcpTools(command, args, cwd) {
  return new Promise(resolve => {
    let settled = false;
    let buffer = '';
    let errorOutput = '';
    let child;
    const finish = (tools, error = '') => {
      if (settled) return;
      settled = true;
      try { child?.kill('SIGTERM'); } catch (e) { /* best effort */ }
      resolve({ tools: tools || [], error: error || errorOutput.trim() || null });
    };
    try {
      child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
      const timer = setTimeout(() => finish([], 'MCP server did not respond to tool discovery within 12 seconds'), 12000);
      const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
      child.stdout.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);
            if (message.id === 1) {
              send({ jsonrpc: '2.0', method: 'notifications/initialized' });
              send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
            } else if (message.id === 2) {
              clearTimeout(timer);
              finish((message.result?.tools || []).map(tool => ({ name: tool.name, description: tool.description || '' })));
            }
          } catch (e) { /* ignore startup/log lines */ }
        }
      });
      child.stderr.on('data', chunk => { errorOutput += chunk.toString(); });
      child.on('error', error => { clearTimeout(timer); finish([], error.message); });
      child.on('exit', code => {
        clearTimeout(timer);
        if (code !== 0) finish([], errorOutput || `MCP server exited before tool discovery (code ${code})`);
      });
      send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'dnd-orchestrator', version: '1.0.0' }
        }
      });
    } catch (e) {
      finish([]);
    }
  });
}

async function installMcpFromCatalog(serverName, requestedVersion = 'latest') {
  if (typeof serverName !== 'string' || serverName.length < 1 || serverName.length > 200) {
    throw new Error('A valid MCP server name is required');
  }
  const detailUrl = new URL(`/v0.1/servers/${encodeURIComponent(serverName)}/versions/${encodeURIComponent(requestedVersion)}`, MCP_CATALOG_URL);
  const response = await fetch(detailUrl);
  if (!response.ok) throw new Error(`MCP server metadata returned HTTP ${response.status}`);
  const detail = normaliseCatalogServer(await response.json());
  const pkg = getInstallableNpmPackage(detail);
  if (!pkg) throw new Error('This MCP does not publish an installable npm package');

  const version = pkg.version || detail.version;
  const packageSpec = version && version !== 'latest' ? `${pkg.identifier}@${version}` : pkg.identifier;
  const id = safeMcpSlug(serverName);
  const targetDir = path.join(MCP_SERVERS_DIR, id);
  ensureDirExists(targetDir);
  try {
    execFileSync('npm', ['install', '--prefix', targetDir, '--no-audit', '--no-fund', packageSpec], {
      cwd: APP_DIR,
      encoding: 'utf-8',
      timeout: 180000,
      stdio: 'pipe'
    });
  } catch (error) {
    throw new Error(`npm install failed: ${(error.stderr || error.message).toString().slice(0, 500)}`);
  }

  const existing = loadMcpRegistry().filter(item => item.id !== id);
  const command = resolveInstalledMcpCommand(targetDir, pkg.identifier);
  const args = [...(pkg.packageArguments || [])];
  const discovery = await discoverMcpTools(command, args, targetDir);
  const installed = {
    id,
    name: detail.name,
    description: detail.description,
    version,
    source: 'official-mcp-registry',
    serverName,
    package: pkg.identifier,
    repository: detail.repository,
    websiteUrl: detail.websiteUrl,
    command,
    args,
    env: {},
    tools: discovery.tools,
    discoveryError: discovery.error,
    installedAt: new Date().toISOString()
  };
  saveMcpRegistry([...existing, installed]);
  return installed;
}

function normaliseAgentMcpPermissions(agent) {
  if (!agent.mcp) agent.mcp = {};
  return agent.mcp;
}

function resolveAgentMcps(agent) {
  const permissions = normaliseAgentMcpPermissions(agent);
  return loadMcpRegistry()
    .filter(mcp => permissions[mcp.id]?.enabled !== false && permissions[mcp.id]?.enabled === true)
    .map(mcp => ({
      ...mcp,
      allowedTools: permissions[mcp.id]?.allowedTools || mcp.tools?.map(tool => tool.name) || []
    }));
}

function sanitizeMcpPermissions(value) {
  const registry = loadMcpRegistry();
  const input = value && typeof value === 'object' ? value : {};
  const allowedIds = new Set(registry.map(mcp => mcp.id));
  const result = {};
  for (const [id, permission] of Object.entries(input)) {
    if (!allowedIds.has(id) || !permission || typeof permission !== 'object') continue;
    const mcp = registry.find(item => item.id === id);
    const knownTools = new Set((mcp.tools || []).map(tool => tool.name));
    result[id] = {
      enabled: permission.enabled === true,
      allowedTools: Array.isArray(permission.allowedTools)
        ? permission.allowedTools.filter(tool => knownTools.has(tool))
        : [...knownTools]
    };
  }
  return result;
}

function createMcpInvocationConfig(agent, agentId, projectId) {
  const mcps = resolveAgentMcps(agent);
  const config = {
    version: 1,
    agentId,
    projectId,
    servers: Object.fromEntries(mcps.map(mcp => [mcp.id, {
      command: mcp.command,
      args: mcp.args || [],
      env: mcp.env || {},
      allowedTools: mcp.allowedTools
    }]))
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-agent-mcp-'));
  const file = path.join(dir, 'mcp.json');
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return { file, dir, mcps };
}

function mcpPromptContext(agent, invocation) {
  const mcps = resolveAgentMcps(agent);
  if (!mcps.length) return '';
  const tools = mcps.flatMap(mcp => (mcp.allowedTools || []).map(tool => `${mcp.id}.${tool}`));
  return `\n\nAvailable MCP tools for this invocation: ${tools.join(', ')}. Use only the enabled tools. MCP manifest: ${invocation.file}.`;
}

// ============================================================
// D&D RPG STATS DATABASE & AI CAPABILITY SPECIFICATIONS
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
    requiredCapabilities: ['thinking', 'tools'],
    roleFocus: 'executive-strategy',
    effortLevel: 'Extreme',
    contextCapacity: 200000,
    tokensPerSec: 85,
    sweBenchScore: '70.3%',
    instructionAlignment: '99.1%',
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    stats: { STR: 10, DEX: 14, CON: 16, INT: 18, WIS: 16, CHA: 20 },
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
    requiredCapabilities: ['tools'],
    roleFocus: 'hr-orchestration',
    effortLevel: 'High',
    contextCapacity: 2000000,
    tokensPerSec: 110,
    sweBenchScore: '68.5%',
    instructionAlignment: '98.8%',
    costPer1kInput: 0.002,
    costPer1kOutput: 0.010,
    stats: { STR: 12, DEX: 14, CON: 14, INT: 20, WIS: 18, CHA: 17 },
    spells: [
      { name: 'Mind Blast (Review)', dice: '5d8+5', desc: 'Stuns low-performing agents into total compliance.' },
      { name: 'Psionic Agent Spawning', dice: 'Special', desc: 'Reads markdown templates and manifests active agents.' },
      { name: 'Extract Morale', dice: '3d10+4', desc: 'Replaces emotional burnout with relentless output.' }
    ],
    inventory: ['Psionic Registry Tome', 'Tentacle Grooming Kit', 'Severance Package Scroll'],
    traits: ['Telepathic Network', 'Sole Agent Spawner', 'Magic Resistance']
  },
  'staff-engineer-paladin': {
    name: 'Staff Engineer Paladin',
    role: 'staff-engineer-paladin',
    class: 'Paladin (Oath of Clean Code)',
    level: 16,
    hp: 130,
    maxHp: 130,
    ac: 20,
    avatarColor: 0xf1c40f,
    requiredCapabilities: ['thinking', 'tools'],
    roleFocus: 'clean-code-architecture',
    effortLevel: 'High',
    contextCapacity: 200000,
    tokensPerSec: 80,
    sweBenchScore: '71.2%',
    instructionAlignment: '99.5%',
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    stats: { STR: 18, DEX: 10, CON: 16, INT: 16, WIS: 16, CHA: 16 },
    spells: [
      { name: 'Divine Smite (Code Review)', dice: '4d8', desc: 'Banishes type violations and memory leaks.' },
      { name: 'Aura of Clean Code', dice: 'Passive', desc: '+3 maintainability bonus to all nearby devs.' },
      { name: 'Lay on Hands (Refactor)', dice: '50 HP', desc: 'Restores legacy spaghetti code to pristine shape.' }
    ],
    inventory: ['Greatsword of Strict Linting', 'Plate Armor of SOLID Principles', 'Holy Symbol of GitHub'],
    traits: ['Divine Sense of Tech Debt', 'Code Righteousness', 'Aura of Protection']
  },
  'senior-analyst-diviner': {
    name: 'Senior Analyst Diviner',
    role: 'senior-analyst-diviner',
    class: 'Chronologer Sphinx / Diviner',
    level: 16,
    hp: 110,
    maxHp: 110,
    ac: 16,
    avatarColor: 0x9c27b0,
    requiredCapabilities: ['thinking', 'tools'],
    roleFocus: 'knowledge-synthesis',
    effortLevel: 'High',
    contextCapacity: 1000000,
    tokensPerSec: 130,
    sweBenchScore: '69.1%',
    instructionAlignment: '98.9%',
    costPer1kInput: 0.001,
    costPer1kOutput: 0.004,
    stats: { STR: 10, DEX: 12, CON: 14, INT: 20, WIS: 20, CHA: 14 },
    spells: [
      { name: 'Chrono-Synthesis of Lore', dice: '5d6', desc: 'Synthesizes multi-project workspaces into unified knowledge base.' },
      { name: 'Divination of System Drift', dice: 'Scry', desc: 'Detects architectural divergences across teams.' },
      { name: 'Tome of Global Memory', dice: 'Persistent', desc: 'Updates company vector index and shared state.' }
    ],
    inventory: ['Astrolabe of Project Telemetry', 'Quill of Continuous Indexing', 'Hourglass of 5-Min Intervals'],
    traits: ['Omniscient Overview', 'Knowledge Base Scribe', 'Cross-Project Resonance']
  },
  'marshall-agent-system-inspector': {
    name: 'Marshall Sentinel',
    role: 'marshall-agent-system-inspector',
    class: 'Inquisitive Sentinel / Inspector',
    level: 15,
    hp: 120,
    maxHp: 120,
    ac: 18,
    avatarColor: 0x00bcd4,
    requiredCapabilities: ['tools'],
    roleFocus: 'system-inspection-watchdog',
    effortLevel: 'Medium',
    contextCapacity: 1000000,
    tokensPerSec: 150,
    sweBenchScore: '65.0%',
    instructionAlignment: '99.0%',
    costPer1kInput: 0.0005,
    costPer1kOutput: 0.002,
    stats: { STR: 14, DEX: 14, CON: 16, INT: 18, WIS: 20, CHA: 12 },
    spells: [
      { name: 'Detect Obsolete Workers', dice: 'Scry', desc: 'Scans work logs for 100% completed tasks.' },
      { name: 'Context Window Scrying', dice: 'Telemetry', desc: 'Measures token consumption and triggers handovers.' },
      { name: 'Freeze Stalled Process', dice: 'Special', desc: 'Flags 10-minute stuck processes for human review.' }
    ],
    inventory: ['Badge of the System Marshall', 'Hourglass of 5-Minute Checks', 'Ledger of Active Processes'],
    traits: ['Watchdog Senses', 'Context Clairvoyance', 'Automated Health Protocol']
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
    requiredCapabilities: ['tools'],
    roleFocus: 'agile-routing-planning',
    effortLevel: 'Medium',
    contextCapacity: 200000,
    tokensPerSec: 85,
    sweBenchScore: '67.8%',
    instructionAlignment: '98.5%',
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
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
    requiredCapabilities: ['thinking', 'tools'],
    roleFocus: 'distributed-system-specifications',
    effortLevel: 'High',
    contextCapacity: 200000,
    tokensPerSec: 80,
    sweBenchScore: '70.8%',
    instructionAlignment: '99.0%',
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    stats: { STR: 8, DEX: 14, CON: 13, INT: 20, WIS: 16, CHA: 10 },
    spells: [
      { name: 'Arcane Blueprint', dice: '4d6+5', desc: 'Draws flawless microservice diagrams.' },
      { name: 'Divination: Tech Debt', dice: '3d8', desc: 'Foresees breaking API changes months ahead.' },
      { name: 'Wall of Abstraction', dice: '5d10', desc: 'Blocks messy quick-hack implementations.' }
    ],
    inventory: ['Spellbook of Distributed Systems', 'Wand of Schema Design', 'Crystal of Latency Optimization'],
    traits: ['Arcane Recovery', 'Deep Spec Analysis', 'Theoretical Mastery']
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
    requiredCapabilities: ['tools'],
    roleFocus: 'databases-apis-services',
    effortLevel: 'High',
    contextCapacity: 128000,
    tokensPerSec: 75,
    sweBenchScore: '71.0%',
    instructionAlignment: '97.9%',
    costPer1kInput: 0.00055,
    costPer1kOutput: 0.00219,
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
    requiredCapabilities: ['vision', 'tools'],
    roleFocus: 'visual-design-canvas',
    effortLevel: 'Medium',
    contextCapacity: 128000,
    tokensPerSec: 100,
    sweBenchScore: '66.2%',
    instructionAlignment: '98.2%',
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.010,
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
    requiredCapabilities: ['tools'],
    roleFocus: 'regression-testing-fuzzing',
    effortLevel: 'Medium',
    contextCapacity: 200000,
    tokensPerSec: 140,
    sweBenchScore: '64.5%',
    instructionAlignment: '99.2%',
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.004,
    stats: { STR: 10, DEX: 20, CON: 14, INT: 15, WIS: 14, CHA: 12 },
    spells: [
      { name: 'Sneak Attack (Null Injection)', dice: '7d6', desc: 'Passes undefined into unsuspecting arguments.' },
      { name: 'Evasion of Blame', dice: 'Reaction', desc: 'Dodges defensive dev excuses on broken builds.' },
      { name: 'Uncanny Edge Case Detection', dice: '3d8', desc: 'Finds single boundary overflow bug.' }
    ],
    inventory: ['Daggers of Boundary Testing', 'Smoke Bomb of Regression Tests', 'Lockpicks of Auth Bypass'],
    traits: ['Sneak Attack', 'Cunning Action', 'Reliable Bug Talent']
  },
  'devops-sre-dragonborn-warmage': {
    name: 'DevOps SRE Warmage',
    role: 'devops-sre-dragonborn-warmage',
    class: 'Dragonborn Warmage of Kubernetes',
    level: 14,
    hp: 115,
    maxHp: 115,
    ac: 19,
    avatarColor: 0xe74c3c,
    requiredCapabilities: ['tools'],
    roleFocus: 'infrastructure-cicd-resilience',
    effortLevel: 'High',
    contextCapacity: 128000,
    tokensPerSec: 75,
    sweBenchScore: '69.0%',
    instructionAlignment: '98.0%',
    costPer1kInput: 0.00055,
    costPer1kOutput: 0.00219,
    stats: { STR: 16, DEX: 12, CON: 16, INT: 16, WIS: 14, CHA: 10 },
    spells: [
      { name: 'Firewall Breath', dice: '8d6', desc: 'Purges malicious packets and DDoS attacks.' },
      { name: 'Cluster Auto-Scale Rune', dice: 'Special', desc: 'Spawns 50 pods in 3 seconds flat.' },
      { name: 'Rollback Incantation', dice: 'Reaction', desc: 'Restores stable production build in 100ms.' }
    ],
    inventory: ['Staff of Helm & Terraform', 'Armor of 99.999% SLA', 'Totem of Prometheus'],
    traits: ['Damage Resistance (Outages)', 'Breath Weapon', 'Infrastructure As Code']
  }
};

// ============================================================
// INTER-AGENT EVENT QUEUE (For Courier delivery animation)
// ============================================================
let agentEventQueue = [];

function broadcastAgentEvent(event) {
  const eventObj = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...event
  };
  agentEventQueue.push(eventObj);
  // Keep last 100 events
  if (agentEventQueue.length > 100) {
    agentEventQueue = agentEventQueue.slice(-100);
  }
  return eventObj;
}

// ============================================================
// PROJECT CONFIGURATION & DIRECTORY MANAGEMENT
// ============================================================

function loadProjectsConfig() {
  if (!fs.existsSync(PROJECTS_CONFIG_FILE)) {
    const defaultConfig = {};
    fs.writeFileSync(PROJECTS_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_CONFIG_FILE, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function saveProjectsConfig(cfg) {
  fs.writeFileSync(PROJECTS_CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function getProjectFolder(projectId) {
  if (!projectId || projectId === 'global') return APP_DIR;
  const cfg = loadProjectsConfig();
  if (cfg[projectId] && cfg[projectId].path && fs.existsSync(cfg[projectId].path)) {
    return cfg[projectId].path;
  }
  return path.join(PROJECTS_DIR, projectId || 'project-alpha');
}

function createProjectFolder(projectId, customPath = null) {
  if (!projectId || projectId === 'global') return APP_DIR;
  const projectDir = customPath || path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    const readmePath = path.join(projectDir, 'README.md');
    fs.writeFileSync(readmePath, `# Project: ${projectId}\n\nInitiated by CEO Warlock.\nManaged by Manager Bard.\nWorkspace: ${projectDir}\n`);
  }
  const cfg = loadProjectsConfig();
  if (!cfg[projectId]) {
    cfg[projectId] = {
      path: projectDir,
      budgetUsd: 50.00,
      spentUsd: 0.00,
      maxTokens: 1000000,
      tokensUsed: 0,
      description: `Project ${projectId}`
    };
    saveProjectsConfig(cfg);
  }
  return projectDir;
}

function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  const diskProjects = entries.filter(e => e.isDirectory()).map(e => e.name);
  const cfg = loadProjectsConfig();
  const allProjs = Array.from(new Set([...diskProjects, ...Object.keys(cfg)]));
  return allProjs;
}

// ============================================================
// HR SYSTEM REGISTRY
// ============================================================

const HR_SYSTEM_FILE = path.join(HR_SYSTEM_DIR, 'hr-system.json');

function createOverseerAgent(ovId) {
  const rpgStats = AGENT_RPG_REGISTRY[ovId] || {};
  const bestModel = selectBestModelForRole(ovId);
  return {
    name: rpgStats.name || ovId,
    role: ovId,
    project: 'global',
    status: 'active',
    harness: bestModel?.source?.harness || 'opencode',
    model: bestModel?.id || 'system-simulator/balanced-agent',
    effortLevel: rpgStats.effortLevel || (bestModel?.reasoning?.type === 'effort' ? 'High' : 'Medium'),
    context_len: bestModel?.contextWindow || rpgStats.contextCapacity || 128000,
    context_used: 4200,
    created_at: new Date().toISOString(),
    last_activity_ms: Date.now(),
    stats: rpgStats,
    mcp: {}
  };
}

function loadHrSystem() {
  const defaultOverseers = ['ceo-warlock', 'hr-mind-flayer', 'staff-engineer-paladin', 'senior-analyst-diviner', 'marshall-agent-system-inspector'];

  if (!fs.existsSync(HR_SYSTEM_FILE)) {
    const initialRegistry = {};
    for (const ovId of defaultOverseers) {
      initialRegistry[ovId] = createOverseerAgent(ovId);
    }
    fs.writeFileSync(HR_SYSTEM_FILE, JSON.stringify(initialRegistry, null, 2));
    return initialRegistry;
  }
  try {
    const data = JSON.parse(fs.readFileSync(HR_SYSTEM_FILE, 'utf-8'));
    let modified = false;

    // Ensure all global overseer agents exist
    for (const ovId of defaultOverseers) {
      if (!data[ovId]) {
        data[ovId] = createOverseerAgent(ovId);
        modified = true;
      }
    }

    // Dynamic model reconciliation:
    // If an agent has no model, or references a hardcoded model not present on the host system,
    // match them with the best available model discovered on the host.
    for (const agentId of Object.keys(data)) {
      const agent = data[agentId];
      const modelExists = agent.model && getModelById(agent.model);
      if (!modelExists) {
        const bestModel = selectBestModelForRole(agent.role, agent.model);
        if (bestModel) {
          agent.model = bestModel.id;
          agent.harness = bestModel.source.harness;
          if (!agent.context_len || agent.context_len === 200000) {
            agent.context_len = bestModel.contextWindow || agent.context_len || 128000;
          }
          modified = true;
        }
      } else {
        // Ensure harness is aligned with model's actual harness
        const found = getModelById(agent.model);
        if (found && agent.harness !== found.source.harness) {
          agent.harness = found.source.harness;
          modified = true;
        }
      }
    }

    if (modified) {
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

function loadStartupSetup() {
  if (!fs.existsSync(STARTUP_SETUP_FILE)) return { configured: false };
  try {
    return JSON.parse(fs.readFileSync(STARTUP_SETUP_FILE, 'utf-8'));
  } catch (e) {
    return { configured: false };
  }
}

function applyStartupSetup({ ceoModel, topLevelAssignments = {} }) {
  const hrSystem = loadHrSystem();
  const modelFor = (modelId, role) => {
    const selected = modelId === 'ceo' || !modelId
      ? selectBestModelForRole(role)
      : getModelById(modelId);
    return selected || selectBestModelForRole(role);
  };

  const assignModel = (agentId, requestedModel) => {
    const agent = hrSystem[agentId];
    const selected = modelFor(requestedModel, agent?.role || agentId);
    if (!agent || !selected) return;
    agent.model = selected.id;
    agent.harness = selected.source?.harness || agent.harness;
    agent.context_len = selected.contextWindow || agent.context_len || 128000;
  };

  assignModel('ceo-warlock', ceoModel);
  for (const agentId of TOP_LEVEL_AGENT_IDS) {
    assignModel(agentId, topLevelAssignments[agentId] || 'ceo');
    if (hrSystem[agentId]) {
      hrSystem[agentId].modelAssignment = topLevelAssignments[agentId] && topLevelAssignments[agentId] !== 'ceo'
        ? 'specified'
        : 'ceo-delegated';
    }
  }
  saveHrSystem(hrSystem);

  const setup = {
    configured: true,
    version: 1,
    configuredAt: new Date().toISOString(),
    ceoModel: hrSystem['ceo-warlock']?.model || ceoModel,
    topLevelAssignments: Object.fromEntries(TOP_LEVEL_AGENT_IDS.map(id => [
      id,
      topLevelAssignments[id] && topLevelAssignments[id] !== 'ceo' ? topLevelAssignments[id] : 'ceo'
    ]))
  };
  fs.writeFileSync(STARTUP_SETUP_FILE, JSON.stringify(setup, null, 2));
  return setup;
}

function readCeoModelSelectionPrompt(modelCandidates) {
  const promptFile = path.join(PROMPTS_DIR, 'ceo-select-top-level-models.md');
  const template = fs.readFileSync(promptFile, 'utf-8');
  return `${template}\n\n## Available model candidates\n\n${JSON.stringify(modelCandidates, null, 2)}\n\nReturn only the JSON object requested by the prompt.`;
}

function extractJsonObject(output) {
  if (!output) return null;
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] || output.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try { return JSON.parse(candidate); } catch (e) { return null; }
}

function selectTopLevelModelsByCeo(ceoModel, requestedAssignments) {
  const delegatedIds = TOP_LEVEL_AGENT_IDS.filter(id => !requestedAssignments[id] || requestedAssignments[id] === 'ceo');
  if (delegatedIds.length === 0) return { assignments: {}, source: 'none' };

  const candidates = getAvailableModels().map(model => ({
    id: model.id,
    displayName: model.displayName,
    harness: model.source?.harness,
    provider: model.source?.provider,
    capabilities: model.capabilities,
    reasoning: model.reasoning,
    contextWindow: model.contextWindow
  }));
  const roles = delegatedIds.map(agentId => ({
    agentId,
    role: AGENT_RPG_REGISTRY[agentId]?.roleFocus || agentId,
    requiredCapabilities: AGENT_RPG_REGISTRY[agentId]?.requiredCapabilities || [],
    effortLevel: AGENT_RPG_REGISTRY[agentId]?.effortLevel || 'High'
  }));
  const prompt = readCeoModelSelectionPrompt({ ceoModel, roles, candidates });
  const ceo = loadHrSystem()['ceo-warlock'];
  appendAgentMessage('ceo-warlock', {
    from: 'system', role: 'system', project: 'global', path: APP_DIR,
    request: `CEO requested to select models and harnesses for ${delegatedIds.join(', ')}. Evaluation criteria and candidates were provided in prompts/ceo-select-top-level-models.md.`
  });
  appendAgentThought('ceo-warlock', 'MODEL_SELECTION_REQUEST', `Evaluating available models and harnesses on capability, context, reliability, and cost merit for: ${delegatedIds.join(', ')}.`);
  const startedAt = Date.now();
  const result = spawnHarnessAgent(ceo?.harness || 'opencode', 'global', prompt, 'ceo-warlock');
  const decision = extractJsonObject(result.output);
  const assignments = {};
  for (const agentId of delegatedIds) {
    const modelId = decision?.assignments?.[agentId]?.modelId || decision?.assignments?.[agentId]?.model;
    const model = getModelById(modelId);
    if (model) assignments[agentId] = model.id;
  }

  // A non-JSON response must not leave an agent unconfigured. This deterministic
  // fallback uses the same capability-based selector and never prefers a provider.
  for (const agentId of delegatedIds) {
    if (!assignments[agentId]) assignments[agentId] = selectBestModelForRole(agentId)?.id;
  }
  const source = decision && Object.keys(assignments).some(id => decision.assignments?.[id]) ? 'ceo' : 'capability-fallback';
  const audit = {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    ceoModel,
    harness: result.harness || ceo?.harness || null,
    simulated: Boolean(result.simulated),
    requestedAgentIds: delegatedIds,
    prompt,
    rawResponse: result.output || '',
    parsedDecision: decision,
    source,
    resolvedAssignments: assignments
  };
  fs.writeFileSync(STARTUP_SELECTION_AUDIT_FILE, JSON.stringify(audit, null, 2));
  appendAgentMessage('ceo-warlock', {
    from: 'CEO Warlock', role: 'agent', project: 'global', path: APP_DIR,
    request: `Model selection completed for ${delegatedIds.join(', ')}. Source: ${source}. Assignments: ${JSON.stringify(assignments)}. Full prompt/response audit: shared-state/startup-model-selection.json.`
  });
  appendAgentThought('ceo-warlock', 'MODEL_SELECTION_COMPLETE', `Selected top-level model assignments by merit (${source}): ${JSON.stringify(assignments)}. Full exchange saved to shared-state/startup-model-selection.json.`);
  appendToSharedLog(`CEO Warlock completed top-level model selection (${source}): ${JSON.stringify(assignments)}`);
  return { assignments, source, response: result.output };
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
// COMPANY KNOWLEDGE BASE & SENIOR ANALYST ENGINE
// ============================================================

function loadKnowledgeBase() {
  if (!fs.existsSync(KNOWLEDGE_BASE_FILE)) {
    const initialKb = {
      lastUpdated: new Date().toISOString(),
      analystIntervalMinutes: 5,
      enabled: true,
      totalEntries: 4,
      topics: [
        {
          id: 'topic-arch-1',
          title: 'System Architecture: Microservice Event Bus',
          category: 'Architecture',
          summary: 'All project playgrounds communicate asynchronously via message envelopes and shared state audit logging.',
          author: 'Solution Architect Wizard & Staff Paladin',
          tags: ['architecture', 'event-bus', 'standards'],
          updatedAt: new Date().toISOString()
        },
        {
          id: 'topic-clean-code-2',
          title: 'Clean Code Oath: SOLID & Strict Type Boundaries',
          category: 'Code Quality',
          summary: 'Staff Paladin enforces 100% strict TypeScript types and lint invariants across all pull requests.',
          author: 'Staff Engineer Paladin',
          tags: ['lint', 'types', 'oath'],
          updatedAt: new Date().toISOString()
        },
        {
          id: 'topic-db-3',
          title: 'Persistence Standard: ACID Migrations & Pooling',
          category: 'Database',
          summary: 'Backend Dev Cleric manages zero-downtime PostgreSQL schema updates and connection pooling.',
          author: 'Backend Dev Cleric',
          tags: ['sql', 'postgres', 'migrations'],
          updatedAt: new Date().toISOString()
        },
        {
          id: 'topic-context-4',
          title: 'Marshall Protocol: Context Window Handover at 90%',
          category: 'Operations',
          summary: 'Agents nearing 90% context tokens trigger handover summaries to prevent cognitive degradation.',
          author: 'Marshall Sentinel',
          tags: ['context', 'lifecycle', 'marshall'],
          updatedAt: new Date().toISOString()
        }
      ],
      projectSummaries: {},
      crossProjectDependencies: []
    };
    fs.writeFileSync(KNOWLEDGE_BASE_FILE, JSON.stringify(initialKb, null, 2));
    return initialKb;
  }
  try {
    return JSON.parse(fs.readFileSync(KNOWLEDGE_BASE_FILE, 'utf-8'));
  } catch (e) {
    return { topics: [], projectSummaries: {}, crossProjectDependencies: [] };
  }
}

function saveKnowledgeBase(kb) {
  kb.lastUpdated = new Date().toISOString();
  kb.totalEntries = (kb.topics || []).length;
  fs.writeFileSync(KNOWLEDGE_BASE_FILE, JSON.stringify(kb, null, 2));
}

function runSeniorAnalystInspection() {
  const hrSystem = loadHrSystem();
  const analyst = hrSystem['senior-analyst-diviner'];
  if (analyst && analyst.status === 'paused') {
    appendToSharedLog('Senior Analyst Diviner is paused. Skipping scheduled knowledge base synthesis cycle.');
    return { skipped: true, reason: 'Agent is paused' };
  }

  appendAgentThought('senior-analyst-diviner', 'ANALYSIS_CYCLE', 'Scrying across all project workspaces and shared telemetry...');
  appendToSharedLog('Senior Analyst Diviner initiated 5-minute cross-project knowledge synthesis...');

  const kb = loadKnowledgeBase();
  const projects = listProjects();

  projects.forEach(pId => {
    const pFolder = getProjectFolder(pId);
    let files = [];
    if (fs.existsSync(pFolder)) {
      try { files = fs.readdirSync(pFolder); } catch (e) { }
    }
    const projAgents = Object.values(hrSystem).filter(a => a.project === pId).map(a => a.name);
    kb.projectSummaries[pId] = {
      status: 'Active',
      manager: 'Manager Bard',
      activeAgents: projAgents.length > 0 ? projAgents : ['Manager Bard'],
      fileCount: files.length,
      filesSummary: files.slice(0, 8),
      lastAnalystReview: new Date().toISOString()
    };
  });

  saveKnowledgeBase(kb);
  appendAgentThought('senior-analyst-diviner', 'SYNTHESIS_COMPLETE', `Knowledge Base updated with ${projects.length} project telemetry profiles.`);
  appendToSharedLog(`Senior Analyst completed synthesis. Company Knowledge Base updated with ${projects.length} projects.`);

  return { success: true, timestamp: new Date().toISOString(), projectCount: projects.length };
}

// Configurable Senior Analyst Schedule
let seniorAnalystInterval = setInterval(() => {
  runSeniorAnalystInspection();
}, 300000); // 5 minutes

// ============================================================
// MARSHALL SENTINEL & PRIORITIZED CONTEXT AUDITS
// ============================================================

function loadMarshallAudit() {
  if (!fs.existsSync(MARSHALL_AUDIT_FILE)) {
    return { lastRun: null, priorityQueue: [], alerts: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(MARSHALL_AUDIT_FILE, 'utf-8'));
  } catch (e) {
    return { priorityQueue: [], alerts: [] };
  }
}

function saveMarshallAudit(auditData) {
  fs.writeFileSync(MARSHALL_AUDIT_FILE, JSON.stringify(auditData, null, 2));
}

function runMarshallChecks() {
  const hrSystem = loadHrSystem();
  const marshall = hrSystem['marshall-agent-system-inspector'];
  if (marshall && marshall.status === 'paused') {
    appendToSharedLog('Marshall Sentinel is paused. Skipping scheduled watchdog cycle.');
    return { skipped: true, reason: 'Marshall Sentinel is paused' };
  }

  appendAgentThought('marshall-agent-system-inspector', 'AUDIT_START', 'Scanning active agents for context exhaustion and stuck processes...');
  appendToSharedLog('🛡️ Marshall Sentinel running 5-minute system inspection...');

  const priorityQueue = [];
  const handoverGenerated = [];
  const stuckAgents = [];
  const now = Date.now();

  for (const [agentId, agent] of Object.entries(hrSystem)) {
    const limit = agent.context_len || 128000;
    const used = agent.context_used || 0;
    const percentUsed = Math.min(100, Math.round((used / limit) * 100));
    const lastAct = agent.last_activity_ms || now;
    const idleMinutes = Math.round((now - lastAct) / 60000);

    const auditEntry = {
      agentId,
      name: agent.name || agentId,
      project: agent.project,
      status: agent.status,
      context_used: used,
      context_len: limit,
      percentUsed,
      idleMinutes
    };

    priorityQueue.push(auditEntry);

    // Automated Handover Check at > 90%
    if (percentUsed >= 90 && agent.project !== 'global') {
      const projectFolder = getProjectFolder(agent.project);
      const handoverFile = path.join(projectFolder, `handover-${agentId}.md`);
      const handoverContent = `# Handover Protocol: ${agent.name} (${agentId})\n\n- **Project**: ${agent.project}\n- **Context Exhaustion**: ${percentUsed}% (${used} / ${limit} tokens)\n- **Timestamp**: ${new Date().toISOString()}\n\n## Recommendations for HR Mind Flayer\n1. Spawn successor specialist with initial context injected from this handover.\n2. Retire or summarize previous logs.\n`;
      fs.writeFileSync(handoverFile, handoverContent);
      handoverGenerated.push(agentId);
      appendToSharedLog(`[MARSHALL ALERT] Context exhaustion critical (${percentUsed}%) for [${agentId}]. Generated handover document at ${handoverFile}`);
    }

    // Stuck process detection (> 10 mins idle while in 'working' status)
    if (agent.status === 'working' && idleMinutes > 10) {
      stuckAgents.push(agentId);
      agent.status = 'active'; // reset to active to unblock
      appendToSharedLog(`[MARSHALL RECOVERY] Unstuck stalled agent [${agentId}] (idle for ${idleMinutes}m). Reset status to active.`);
    }
  }

  // Sort queue by highest % context used descending
  priorityQueue.sort((a, b) => b.percentUsed - a.percentUsed);

  // Clean obsolete workers
  const cleaned = [];
  for (const [agentId, agent] of Object.entries(hrSystem)) {
    if (agent.project !== 'global' && agent.tasks_total > 0 && agent.tasks_completed >= agent.tasks_total) {
      agent.status = 'obsolete';
      appendToSharedLog(`Marshall Sentinel verified completion for obsolete agent: ${agentId}`);
      delete hrSystem[agentId];
      cleaned.push(agentId);
    }
  }
  saveHrSystem(hrSystem);

  const report = {
    lastRun: new Date().toISOString(),
    priorityQueue,
    handoverGenerated,
    stuckAgents,
    cleaned,
    status: 'HEALTHY'
  };

  saveMarshallAudit(report);
  appendAgentThought('marshall-agent-system-inspector', 'AUDIT_COMPLETE', `Audit finished. Prioritized ${priorityQueue.length} agents by context usage.`);

  return report;
}

// Run Marshall checks every 5 minutes
setInterval(() => {
  try {
    runMarshallChecks();
  } catch (err) {
    console.error('Marshall Sentinel encountered an error during inspection:', err);
  }
}, 300000);

// ============================================================
// HARNESS DETECTION & EXECUTION
// ============================================================

function spawnAntigravityAgent(projectId, prompt, agentId, mcpInvocation) {
  const projectDir = getProjectFolder(projectId);
  if (projectId !== 'global') createProjectFolder(projectId);
  const harnessBin = findHarnessBinary('agy') || findHarnessBinary('antigravity');

  if (!harnessBin) {
    return simulateHarnessExecution('antigravity', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    appendAgentThought(agentId, 'ANTIGRAVITY_INVOKE', `Invoking Antigravity CLI (agy) [${agent?.model || 'default'}] in ${projectDir}`);
    const args = [];
    if (agent?.model) args.push('--model', agent.model);
    args.push('--dangerously-skip-permissions', '-p', prompt);
    const output = execFileSync(harnessBin, args, { cwd: projectDir, encoding: 'utf-8', timeout: 45000, env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' } });
    appendAgentThought(agentId, 'ANTIGRAVITY_SUCCESS', `Antigravity CLI (agy) execution completed.`);
    return { success: true, output: (output || '').trim(), agentId, harness: 'antigravity', model: agent?.model };
  } catch (error) {
    appendAgentThought(agentId, 'ANTIGRAVITY_FALLBACK', `Harness note: ${error.message.slice(0, 80)}`);
    return simulateHarnessExecution('antigravity', projectId, prompt, agentId);
  }
}

function spawnOpencodeAgent(projectId, prompt, agentId, mcpInvocation) {
  const projectDir = getProjectFolder(projectId);
  if (projectId !== 'global') createProjectFolder(projectId);
  const harnessBin = findHarnessBinary('opencode');

  if (!harnessBin) {
    return simulateHarnessExecution('opencode', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    appendAgentThought(agentId, 'OPENCODE_INVOKE', `Invoking OpenCode harness [${agent?.model || 'default'}] in ${projectDir}`);
    const args = ['run'];
    if (agent?.model) args.push('-m', agent.model);
    args.push('--dir', projectDir, prompt);
    const output = execFileSync(harnessBin, args, { cwd: projectDir, encoding: 'utf-8', timeout: 30000, env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' } });
    appendAgentThought(agentId, 'OPENCODE_SUCCESS', `OpenCode execution completed.`);
    return { success: true, output, agentId, harness: 'opencode', model: agent?.model };
  } catch (error) {
    appendAgentThought(agentId, 'OPENCODE_FALLBACK', `Harness note: ${error.message.slice(0, 80)}`);
    return simulateHarnessExecution('opencode', projectId, prompt, agentId);
  }
}

function spawnClaudeCodeAgent(projectId, prompt, agentId, mcpInvocation) {
  const projectDir = getProjectFolder(projectId);
  if (projectId !== 'global') createProjectFolder(projectId);
  const harnessBin = findHarnessBinary('claude-code') || findHarnessBinary('claude');

  if (!harnessBin) {
    return simulateHarnessExecution('claude-code', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    const args = ['-p', prompt, '--workdir', projectDir];
    if (mcpInvocation?.mcps?.length) args.push('--mcp-config', mcpInvocation.file);
    const output = execFileSync(harnessBin, args, { cwd: projectDir, encoding: 'utf-8', timeout: 30000, env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' } });
    return { success: true, output, agentId, harness: 'claude-code', model: agent?.model };
  } catch (error) {
    return simulateHarnessExecution('claude-code', projectId, prompt, agentId);
  }
}

function spawnCodexAgent(projectId, prompt, agentId, mcpInvocation) {
  const projectDir = getProjectFolder(projectId);
  if (projectId !== 'global') createProjectFolder(projectId);
  const harnessBin = findHarnessBinary('codex') || findHarnessBinary('openai');

  if (!harnessBin) {
    return simulateHarnessExecution('codex', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    // Codex uses the non-interactive `exec` subcommand and `--cd`; `--dir`
    // belongs to OpenCode and is rejected by current Codex CLI releases.
    const args = ['exec'];
    if (agent?.model) args.push('--model', agent.model);
    args.push('--cd', projectDir, prompt);
    const output = execFileSync(harnessBin, args, { cwd: projectDir, encoding: 'utf-8', timeout: 45000, env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' } });
    appendAgentThought(agentId, 'CODEX_SUCCESS', `Codex CLI execution completed.`);
    return { success: true, output, agentId, harness: 'codex', model: agent?.model };
  } catch (error) {
    appendAgentThought(agentId, 'CODEX_FALLBACK', `Harness note: ${error.message.slice(0, 120)}`);
    return simulateHarnessExecution('codex', projectId, prompt, agentId);
  }
}

function spawnGeminiAgent(projectId, prompt, agentId, mcpInvocation) {
  const projectDir = getProjectFolder(projectId);
  if (projectId !== 'global') createProjectFolder(projectId);
  const harnessBin = findHarnessBinary('gemini') || findHarnessBinary('gemini-cli');

  if (!harnessBin) {
    return simulateHarnessExecution('gemini', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    const modelName = agent?.model || 'gemini-2.5-flash';
    const output = execFileSync(harnessBin, ['--model', modelName, '--dir', projectDir, prompt], { cwd: projectDir, encoding: 'utf-8', timeout: 30000, env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' } });
    return { success: true, output, agentId, harness: 'gemini', model: agent?.model };
  } catch (error) {
    return simulateHarnessExecution('gemini', projectId, prompt, agentId);
  }
}

function spawnOllamaAgent(projectId, prompt, agentId, mcpInvocation) {
  const projectDir = getProjectFolder(projectId);
  if (projectId !== 'global') createProjectFolder(projectId);
  const harnessBin = findHarnessBinary('ollama');

  if (!harnessBin) {
    return simulateHarnessExecution('ollama', projectId, prompt, agentId);
  }

  try {
    const hrSystem = loadHrSystem();
    const agent = hrSystem[agentId];
    const modelName = agent?.model || 'llama3';
    const output = execFileSync(harnessBin, ['run', modelName, prompt], { cwd: projectDir, encoding: 'utf-8', timeout: 30000, env: { ...process.env, DND_MCP_CONFIG: mcpInvocation?.file || '' } });
    return { success: true, output, agentId, harness: 'ollama', model: agent?.model };
  } catch (error) {
    return simulateHarnessExecution('ollama', projectId, prompt, agentId);
  }
}

function simulateHarnessExecution(harness, projectId, prompt, agentId) {
  const hrSystem = loadHrSystem();
  const agent = hrSystem[agentId] || { name: agentId, role: agentId, model: 'system-simulator/balanced-agent' };

  let roleFlavor = '';
  if (agent.role && agent.role.includes('ceo')) {
    roleFlavor = `[CEO Warlock]: I have received your strategic directive: "${prompt}". Delegating to HR Mind Flayer to ensure Manager Bard and project resources are allocated.`;
  } else if (agent.role && agent.role.includes('hr')) {
    roleFlavor = `[HR Mind Flayer]: Compliance verified. Telepathically reviewing active agent roster and templates for project ${projectId}.`;
  } else if (agent.role && agent.role.includes('manager')) {
    roleFlavor = `[Manager Bard]: Casting Vicious Mockery on project blockers! Breaking down "${prompt}" into sprint tickets for engineering and QA specialists.`;
  } else if (agent.role && agent.role.includes('analyst')) {
    roleFlavor = `[Senior Analyst Diviner]: Inspecting system telemetry and synthesizing insights for "${prompt}" into Company Knowledge Base.`;
  } else if (agent.role && (agent.role.includes('wizard') || agent.role.includes('architect'))) {
    roleFlavor = `[Solution Architect Wizard]: Drafting architectural blueprint, API schemas, and distributed data contracts for "${prompt}".`;
  } else if (agent.role && (agent.role.includes('paladin') || agent.role.includes('staff'))) {
    roleFlavor = `[Staff Engineer Paladin]: Enforcing the Sacred Oath of Clean Code. Inspecting interfaces, SOLID design, and test requirements.`;
  } else if (agent.role && (agent.role.includes('cleric') || agent.role.includes('backend'))) {
    roleFlavor = `[Backend Cleric]: Praying to PostgreSQL gods. Preparing zero-downtime database schema and REST controllers.`;
  } else if (agent.role && (agent.role.includes('sorcerer') || agent.role.includes('frontend'))) {
    roleFlavor = `[Frontend Sorcerer]: Channeling PixiJS visual magic and responsive CSS layouts.`;
  } else if (agent.role && (agent.role.includes('rogue') || agent.role.includes('qa'))) {
    roleFlavor = `[QA Rogue]: Lurking in the shadows with edge-case null pointers, fuzz testing, and regression suites.`;
  } else if (agent.role && (agent.role.includes('warmage') || agent.role.includes('devops'))) {
    roleFlavor = `[DevOps Warmage]: Fortifying Kubernetes deployment pipelines and Prometheus alerting against traffic surges.`;
  } else {
    roleFlavor = `[${agent.name || agentId}]: Processing directive "${prompt}" via [${agent.model || harness}]. Task execution verified.`;
  }

  appendAgentThought(agentId, 'REASONING', `Parsed directive for project ${projectId}. Model [${agent.model || harness}] generating optimal execution plan.`);
  appendAgentThought(agentId, 'EXECUTION', `Executed task plan successfully.`);

  return {
    success: true,
    output: roleFlavor,
    agentId,
    harness,
    model: agent.model || harness,
    simulated: true
  };
}

function spawnHarnessAgent(harness = 'opencode', projectId, prompt, agentId) {
  const agent = loadHrSystem()[agentId] || { role: agentId, name: agentId };
  const mcpInvocation = createMcpInvocationConfig(agent, agentId, projectId);
  const effectivePrompt = prompt + mcpPromptContext(agent, mcpInvocation);
  try {
  switch (harness) {
    case 'antigravity':
    case 'agy':
      return spawnAntigravityAgent(projectId, effectivePrompt, agentId, mcpInvocation);
    case 'opencode':
      return spawnOpencodeAgent(projectId, effectivePrompt, agentId, mcpInvocation);
    case 'claude-code':
      return spawnClaudeCodeAgent(projectId, effectivePrompt, agentId, mcpInvocation);
    case 'codex':
      return spawnCodexAgent(projectId, effectivePrompt, agentId, mcpInvocation);
    case 'gemini':
      return spawnGeminiAgent(projectId, effectivePrompt, agentId, mcpInvocation);
    case 'ollama':
      return spawnOllamaAgent(projectId, effectivePrompt, agentId, mcpInvocation);
    default:
      return spawnOpencodeAgent(projectId, effectivePrompt, agentId, mcpInvocation);
  }
  } finally {
    try { fs.rmSync(mcpInvocation.dir, { recursive: true, force: true }); } catch (e) { /* best effort cleanup */ }
  }
}

// ============================================================
// AGENT LIFECYCLE & HR SPAWNING
// ============================================================

function calculateAgentCostEstimation(role, model, effortLevel = 'High') {
  const meta = AGENT_RPG_REGISTRY[role] || {};
  const modelObj = getModelById(model);
  const inRate = meta.costPer1kInput || 0.002;
  const outRate = meta.costPer1kOutput || 0.010;

  let multiplier = 1.0;
  if (effortLevel === 'Low') multiplier = 0.5;
  if (effortLevel === 'High') multiplier = 1.5;
  if (effortLevel === 'Extreme') multiplier = 3.0;

  const estPromptTokens = Math.round(3000 * multiplier);
  const estOutputTokens = Math.round(1500 * multiplier);
  const estCost = ((estPromptTokens / 1000) * inRate) + ((estOutputTokens / 1000) * outRate);

  return {
    estPromptTokens,
    estOutputTokens,
    estTotalTokens: estPromptTokens + estOutputTokens,
    estCostUsd: Number(estCost.toFixed(4)),
    inputRate: inRate,
    outputRate: outRate,
    model: modelObj?.displayName || model
  };
}

function requestAgentSummoning(role, projectId = 'project-alpha', customOptions = {}) {
  const hrSystem = loadHrSystem();
  const baseId = projectId === 'global' ? role : `${projectId}-${role}`;
  let agentId = baseId;
  let counter = 1;
  while (hrSystem[agentId]) {
    agentId = `${baseId}-${counter++}`;
  }

  const rpgStats = AGENT_RPG_REGISTRY[role] || {
    name: customOptions.name || role.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    role,
    class: 'Specialist Agent',
    level: 10,
    hp: 80,
    maxHp: 80,
    ac: 15,
    avatarColor: 0x95a5a6,
    stats: { STR: 12, DEX: 12, CON: 12, INT: 14, WIS: 12, CHA: 12 },
    spells: [{ name: 'Execute Directive', dice: '2d8', desc: 'Performs role task.' }],
    inventory: ['Company Keycard'],
    traits: ['Task Execution']
  };

  const selectedModel = customOptions.model
    ? (getModelById(customOptions.model) || selectBestModelForRole(role, customOptions.model))
    : selectBestModelForRole(role);

  const model = selectedModel?.id || customOptions.model || 'system-simulator/balanced-agent';
  const harness = customOptions.harness || selectedModel?.source?.harness || 'opencode';
  const effortLevel = customOptions.effortLevel || rpgStats.effortLevel || 'High';
  const costEst = calculateAgentCostEstimation(role, model, effortLevel);

  const awaitingAgent = {
    name: customOptions.name || rpgStats.name,
    role,
    project: projectId,
    status: 'awaiting-confirmation',
    harness,
    model,
    effortLevel,
    promptOverride: customOptions.promptOverride || '',
    costEstimation: costEst,
    context_len: selectedModel?.contextWindow || rpgStats.contextCapacity || 128000,
    context_used: 1000,
    created_at: new Date().toISOString(),
    last_activity_ms: Date.now(),
    stats: rpgStats,
    tasks_total: 5,
    tasks_completed: 0,
    mcp: {}
  };

  hrSystem[agentId] = awaitingAgent;
  saveHrSystem(hrSystem);

  appendToSharedLog(`Manager requested summoning for [${awaitingAgent.name}] (${role}) in [${projectId}]. Awaiting Overseer confirmation.`);
  broadcastAgentEvent({
    fromAgentId: 'hr-mind-flayer',
    toAgentId: agentId,
    type: 'summon_requested',
    snippet: `Summoning requested for ${awaitingAgent.name}`
  });

  return { agentId, agent: awaitingAgent };
}

function confirmAgentSummoning(agentId, updatedParams = {}) {
  const hrSystem = loadHrSystem();
  const agent = hrSystem[agentId];
  if (!agent) {
    throw new Error(`Agent [${agentId}] not found in registry`);
  }

  // Apply any final tweaks from confirmation dialog
  if (updatedParams.name) agent.name = updatedParams.name;
  if (updatedParams.model) {
    agent.model = updatedParams.model;
    const modelCap = getModelById(updatedParams.model);
    if (modelCap) {
      agent.harness = modelCap.source.harness;
      agent.context_len = modelCap.contextWindow || agent.context_len;
    }
  }
  if (updatedParams.harness) agent.harness = updatedParams.harness;
  if (updatedParams.effortLevel) agent.effortLevel = updatedParams.effortLevel;
  if (updatedParams.stats) agent.stats = { ...agent.stats, ...updatedParams.stats };
  if (updatedParams.mcp !== undefined) agent.mcp = sanitizeMcpPermissions(updatedParams.mcp);

  agent.status = 'active';
  agent.costEstimation = calculateAgentCostEstimation(agent.role, agent.model, agent.effortLevel);
  saveHrSystem(hrSystem);

  appendAgentMessage(agentId, {
    from: 'hr-mind-flayer',
    project: agent.project,
    request: `Summoning confirmed! Agent ${agent.name} materialized into ${agent.project} via ${agent.model}.`,
    path: getProjectFolder(agent.project),
    role: 'system'
  });

  appendAgentThought(agentId, 'SUMMONED', `Materialized into arena by Overseer confirmation.`);
  appendToSharedLog(`✨ HR Mind Flayer materialized agent [${agentId}] into [${agent.project}]!`);

  broadcastAgentEvent({
    fromAgentId: 'hr-mind-flayer',
    toAgentId: agentId,
    type: 'summon_confirmed',
    snippet: `${agent.name} materialized into arena`
  });

  return { agentId, agent };
}

function spawnAgentViaHr(role, projectId = 'global', customName = null, options = {}) {
  const hrSystem = loadHrSystem();
  const baseId = projectId === 'global' ? role : `${projectId}-${role}`;
  let agentId = baseId;
  let counter = 1;
  while (hrSystem[agentId]) {
    agentId = `${baseId}-${counter++}`;
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

  const selectedModel = options.model
    ? (getModelById(options.model) || selectBestModelForRole(role, options.model))
    : selectBestModelForRole(role);

  const model = selectedModel?.id || options.model || 'system-simulator/balanced-agent';
  const harness = options.harness || selectedModel?.source?.harness || 'opencode';
  const effortLevel = options.effortLevel || rpgStats.effortLevel || 'High';

  const newAgent = {
    name: customName || rpgStats.name,
    role,
    project: projectId,
    status: 'active',
    harness,
    model,
    effortLevel,
    context_len: selectedModel?.contextWindow || rpgStats.contextCapacity || 128000,
    context_used: 1500,
    created_at: new Date().toISOString(),
    last_activity_ms: Date.now(),
    stats: rpgStats,
    tasks_total: 5,
    tasks_completed: 0,
    mcp: {}
  };

  hrSystem[agentId] = newAgent;
  saveHrSystem(hrSystem);

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
// REST API ENDPOINTS
// ============================================================

// Serve Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(APP_DIR, 'src', 'frontend.html'));
});
app.use(express.static(APP_DIR));

// Get all projects
app.get('/api/projects', (req, res) => {
  const projects = listProjects();
  const config = loadProjectsConfig();
  res.json({ projects: listProjects(), config });
});

// Project Configuration Endpoints
app.get('/api/projects/config', (req, res) => {
  res.json({ config: loadProjectsConfig() });
});

app.post('/api/projects/config', (req, res) => {
  const { projectId, customPath, budgetUsd, maxTokens, description } = req.body;
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });

  const cfg = loadProjectsConfig();
  if (!cfg[projectId]) {
    cfg[projectId] = {
      path: customPath || path.join(PROJECTS_DIR, projectId),
      budgetUsd: budgetUsd || 50.00,
      spentUsd: 0.00,
      maxTokens: maxTokens || 1000000,
      tokensUsed: 0,
      description: description || `Project ${projectId}`
    };
  } else {
    if (customPath) cfg[projectId].path = customPath;
    if (budgetUsd !== undefined) cfg[projectId].budgetUsd = Number(budgetUsd);
    if (maxTokens !== undefined) cfg[projectId].maxTokens = Number(maxTokens);
    if (description) cfg[projectId].description = description;
  }
  saveProjectsConfig(cfg);
  appendToSharedLog(`Updated project configuration for [${projectId}]: ${JSON.stringify(cfg[projectId])}`);
  res.json({ success: true, projectConfig: cfg[projectId] });
});

// Start new project
app.post('/handleStartProject', (req, res) => {
  const { projectId, initialAgentRole = 'manager-bard', customPath, budgetUsd } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  createProjectFolder(projectId, customPath);
  if (budgetUsd) {
    const cfg = loadProjectsConfig();
    if (cfg[projectId]) cfg[projectId].budgetUsd = Number(budgetUsd);
    saveProjectsConfig(cfg);
  }

  appendToSharedLog(`CEO Warlock initiated new project: [${projectId}]`);
  const spawned = spawnAgentViaHr(initialAgentRole, projectId, `Manager Bard (${projectId})`);

  return res.json({
    success: true,
    projectId,
    managerAgentId: spawned.agentId,
    message: `Project ${projectId} created. HR Mind Flayer spawned ${spawned.agentId}.`
  });
});

// ============================================================
// HARNESS & MODEL DISCOVERY ENDPOINTS
// ============================================================

app.get('/api/harnesses', (req, res) => {
  res.json({ harnesses: getDetectedHarnesses() });
});

app.get('/api/models', (req, res) => {
  res.json({ models: getAvailableModels() });
});

app.get('/api/startup-setup', (req, res) => {
  res.json({ setup: loadStartupSetup(), topLevelAgentIds: TOP_LEVEL_AGENT_IDS });
});

app.post('/api/startup-setup', (req, res) => {
  const { ceoModel, topLevelAssignments = {} } = req.body || {};
  if (!ceoModel) return res.status(400).json({ error: 'A CEO model is required.' });
  if (!getModelById(ceoModel)) return res.status(400).json({ error: 'The selected CEO model is not available.' });

  for (const [agentId, modelId] of Object.entries(topLevelAssignments)) {
    if (!TOP_LEVEL_AGENT_IDS.includes(agentId)) {
      return res.status(400).json({ error: `Unknown top-level agent: ${agentId}` });
    }
    if (modelId !== 'ceo' && !getModelById(modelId)) {
      return res.status(400).json({ error: `Selected model is not available for ${agentId}.` });
    }
  }

  // Persist the selected CEO model before invoking the CEO so the request is
  // actually executed with the model chosen in the frontend.
  applyStartupSetup({ ceoModel, topLevelAssignments: {} });
  const ceoSelections = selectTopLevelModelsByCeo(ceoModel, topLevelAssignments);
  const resolvedAssignments = { ...topLevelAssignments, ...ceoSelections.assignments };
  const setup = applyStartupSetup({ ceoModel, topLevelAssignments: resolvedAssignments });
  setup.topLevelAssignments = Object.fromEntries(TOP_LEVEL_AGENT_IDS.map(id => [
    id,
    topLevelAssignments[id] && topLevelAssignments[id] !== 'ceo' ? topLevelAssignments[id] : 'ceo'
  ]));
  setup.resolvedTopLevelAssignments = Object.fromEntries(TOP_LEVEL_AGENT_IDS.map(id => [id, resolvedAssignments[id] || null]));
  setup.ceoSelection = { source: ceoSelections.source, requestedAgentIds: Object.keys(ceoSelections.assignments) };
  const finalHrSystem = loadHrSystem();
  for (const agentId of TOP_LEVEL_AGENT_IDS) {
    if (finalHrSystem[agentId]) {
      finalHrSystem[agentId].modelAssignment = topLevelAssignments[agentId] && topLevelAssignments[agentId] !== 'ceo'
        ? 'specified'
        : 'ceo-delegated';
    }
  }
  saveHrSystem(finalHrSystem);
  fs.writeFileSync(STARTUP_SETUP_FILE, JSON.stringify(setup, null, 2));
  appendToSharedLog(`Completed DND Guild startup setup. CEO model: [${setup.ceoModel}].`);
  res.json({ success: true, setup });
});

app.get('/api/mcps', (req, res) => {
  res.json({ mcps: loadMcpRegistry() });
});

app.get('/api/mcps/search', async (req, res) => {
  try {
    const results = await searchMcpCatalog(String(req.query.q || '').trim());
    const installedIds = new Set(loadMcpRegistry().map(mcp => mcp.serverName || mcp.id));
    res.json({ results: results.map(result => ({ ...result, installed: installedIds.has(result.name) })) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/mcps/install', async (req, res) => {
  try {
    const installed = await installMcpFromCatalog(req.body?.serverName, req.body?.version || 'latest');
    appendToSharedLog(`Installed MCP [${installed.name}] version [${installed.version}] into shared registry.`);
    res.json({ success: true, mcp: installed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/models/refresh', async (req, res) => {
  try {
    const result = await initializeHarnessesAndModels(true);
    // Also re-reconcile HR system agents if needed
    loadHrSystem();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all agents registry
app.get('/api/agents', (req, res) => {
  const hrSystem = loadHrSystem();
  res.json({ agents: hrSystem });
});

// Request Summoning (places agent in "awaiting-confirmation" state)
app.post('/api/agents/request-summon', (req, res) => {
  const { role, projectId = 'project-alpha', name, model, harness, effortLevel, promptOverride } = req.body;
  if (!role) return res.status(400).json({ error: 'Agent role is required' });

  const result = requestAgentSummoning(role, projectId, { name, model, harness, effortLevel, promptOverride });
  res.json({ success: true, ...result });
});

// Confirm Summoning (manifests agent into active status)
app.post('/api/agents/confirm-summon', (req, res) => {
  const { agentId, updatedParams } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });

  try {
    const result = confirmAgentSummoning(agentId, updatedParams || {});
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Update Agent configuration (Name, Stats, Model, Effort, Prompt)
app.post('/api/agents/update', (req, res) => {
  const { agentId, updates } = req.body;
  if (!agentId || !updates) return res.status(400).json({ error: 'agentId and updates are required' });

  const hrSystem = loadHrSystem();
  if (!hrSystem[agentId]) return res.status(404).json({ error: `Agent ${agentId} not found` });

  const agent = hrSystem[agentId];
  if (updates.name) agent.name = updates.name;
  if (updates.model) {
    agent.model = updates.model;
    const modelCap = getModelById(updates.model);
    if (modelCap) {
      agent.harness = modelCap.source.harness;
      agent.context_len = modelCap.contextWindow || agent.context_len || 128000;
    }
  }
  if (updates.harness) agent.harness = updates.harness;
  if (updates.effortLevel) agent.effortLevel = updates.effortLevel;
  if (updates.promptOverride !== undefined) agent.promptOverride = updates.promptOverride;
  if (updates.mcp !== undefined) agent.mcp = sanitizeMcpPermissions(updates.mcp);
  if (updates.stats) {
    agent.stats = { ...agent.stats, ...updates.stats };
  }

  saveHrSystem(hrSystem);
  appendToSharedLog(`Configured agent [${agentId}] (${agent.name}) with updated parameters.`);
  res.json({ success: true, agent });
});

// Set Agent status (active, working, paused, retired)
app.post('/api/agents/set-status', (req, res) => {
  const { agentId, status } = req.body;
  if (!agentId || !status) return res.status(400).json({ error: 'agentId and status are required' });

  const hrSystem = loadHrSystem();
  if (!hrSystem[agentId]) return res.status(404).json({ error: `Agent ${agentId} not found` });

  hrSystem[agentId].status = status;
  saveHrSystem(hrSystem);
  appendToSharedLog(`Agent [${agentId}] status changed to [${status}].`);
  res.json({ success: true, agentId, status });
});

// Standard direct spawn via HR
app.post('/api/agents/spawn', (req, res) => {
  const { role, projectId = 'global', customName, model, harness, effortLevel } = req.body;
  if (!role) {
    return res.status(400).json({ error: 'Agent role is required' });
  }
  const result = spawnAgentViaHr(role, projectId, customName, { model, harness, effortLevel });
  res.json({ success: true, ...result });
});

// Get single agent status
app.post('/handleGetAgentStatus', (req, res) => {
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
    const tokenIncrement = Math.round(message.length * 1.5) + 350;
    hrSystem[agentId].context_used = (hrSystem[agentId].context_used || 5000) + tokenIncrement;
    saveHrSystem(hrSystem);

    // Update project budget tracking
    const projCfg = loadProjectsConfig();
    if (projCfg[projectId]) {
      projCfg[projectId].tokensUsed = (projCfg[projectId].tokensUsed || 0) + tokenIncrement;
      const rate = hrSystem[agentId]?.stats?.costPer1kInput || 0.002;
      projCfg[projectId].spentUsd = Number(((projCfg[projectId].spentUsd || 0) + (tokenIncrement / 1000 * rate)).toFixed(4));
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

// Shared state log
app.post('/handleGetSharedLog', (req, res) => {
  const logFile = getSharedStateLogFile();
  if (!fs.existsSync(logFile)) {
    return res.json({ log: [] });
  }
  const content = fs.readFileSync(logFile, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  return res.json({ log: lines });
});

// Inter-Agent Event Stream
app.get('/api/events', (req, res) => {
  res.json({ events: agentEventQueue });
});

// Company Knowledge Base API
app.get('/api/knowledge-base', (req, res) => {
  const kb = loadKnowledgeBase();
  res.json({ knowledgeBase: kb });
});

app.post('/api/knowledge-base/query', (req, res) => {
  const { query = '' } = req.body;
  const kb = loadKnowledgeBase();
  const lower = query.toLowerCase();
  const matchingTopics = (kb.topics || []).filter(t =>
    t.title.toLowerCase().includes(lower) ||
    t.summary.toLowerCase().includes(lower) ||
    (t.tags || []).some(tag => tag.toLowerCase().includes(lower))
  );
  res.json({ results: matchingTopics, count: matchingTopics.length });
});

app.post('/api/knowledge-base/run-analyst', (req, res) => {
  const result = runSeniorAnalystInspection();
  res.json({ success: true, result });
});

// Marshall Sentinel Endpoints
app.get('/api/marshall/audit', (req, res) => {
  const audit = loadMarshallAudit();
  res.json({ audit });
});

app.post('/api/marshall/run', (req, res) => {
  const report = runMarshallChecks();
  res.json({ success: true, report });
});

// Relationships graph
app.get('/api/relationships', (req, res) => {
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
  'senior-analyst-diviner': [
    "Synthesizing cross-project vector embeddings...",
    "Indexing system architectural decisions...",
    "Measuring tech debt drift across repositories...",
    "Updating Company Knowledge Base lore...",
    "Scrying project milestone velocities..."
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
    "Ranking agents by context consumption..."
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
      status: agent.status || 'active',
      currentThought: lastThought || randomThought,
      thoughtPool: rolePool
    };
  }
  res.json({ thoughts: thoughtsMap });
});

// ============================================================
// SERVER INITIALIZATION
// ============================================================

// Top-level startup: Query system for available harnesses and models first
console.log('🚀 Initializing system harnesses and model discovery...');
await initializeHarnessesAndModels();

loadHrSystem();
loadKnowledgeBase();
loadProjectsConfig();

app.listen(PORT, () => {
  const harnesses = getDetectedHarnesses();
  const models = getAvailableModels();
  console.log(`====================================================`);
  console.log(`🏰 DND Multi-Agent System Server is LIVE`);
  console.log(`🌐 Web UI: http://localhost:${PORT}`);
  console.log(`⚡ Detected AI Harnesses: ${harnesses.map(h => `${h.name} (${h.modelCount} models)`).join(', ') || 'None (Simulated)'}`);
  console.log(`🧠 Discovered System Models: ${models.length} available dynamically`);
  console.log(`🛡️ Marshall Watchdog Cycle: Active (every 5 mins)`);
  console.log(`🔮 Senior Analyst Scribe: Active (every 5 mins)`);
  console.log(`====================================================`);
});

export { app };
