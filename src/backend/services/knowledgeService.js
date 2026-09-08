import fs from 'fs';
import { KNOWLEDGE_BASE_FILE } from '../config.js';
import { loadHrSystem } from './hrService.js';
import { getProjectFolder, listProjects } from './projectService.js';
import { appendAgentThought, appendToSharedLog } from './messageService.js';

export function loadKnowledgeBase() {
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
          summary:
            'All project playgrounds communicate asynchronously via message envelopes and shared state audit logging.',
          author: 'Solution Architect Wizard & Staff Paladin',
          tags: ['architecture', 'event-bus', 'standards'],
          updatedAt: new Date().toISOString()
        },
        {
          id: 'topic-clean-code-2',
          title: 'Clean Code Oath: SOLID & Strict Type Boundaries',
          category: 'Code Quality',
          summary:
            'Staff Paladin enforces 100% strict TypeScript types and lint invariants across all pull requests.',
          author: 'Staff Engineer Paladin',
          tags: ['lint', 'types', 'oath'],
          updatedAt: new Date().toISOString()
        },
        {
          id: 'topic-db-3',
          title: 'Persistence Standard: ACID Migrations & Pooling',
          category: 'Database',
          summary:
            'Backend Dev Cleric manages zero-downtime PostgreSQL schema updates and connection pooling.',
          author: 'Backend Dev Cleric',
          tags: ['sql', 'postgres', 'migrations'],
          updatedAt: new Date().toISOString()
        },
        {
          id: 'topic-context-4',
          title: 'Marshall Protocol: Context Window Handover at 90%',
          category: 'Operations',
          summary:
            'Agents nearing 90% context tokens trigger handover summaries to prevent cognitive degradation.',
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

export function saveKnowledgeBase(kb) {
  kb.lastUpdated = new Date().toISOString();
  kb.totalEntries = (kb.topics || []).length;
  fs.writeFileSync(KNOWLEDGE_BASE_FILE, JSON.stringify(kb, null, 2));
}

export function runSeniorAnalystInspection() {
  const hrSystem = loadHrSystem();
  const analyst = hrSystem['senior-analyst-diviner'];
  if (analyst && analyst.status === 'paused') {
    appendToSharedLog('Senior Analyst Diviner is paused. Skipping scheduled knowledge base synthesis cycle.');
    return { skipped: true, reason: 'Agent is paused' };
  }

  appendAgentThought(
    'senior-analyst-diviner',
    'ANALYSIS_CYCLE',
    'Scrying across all project workspaces and shared telemetry...'
  );
  appendToSharedLog('Senior Analyst Diviner initiated 5-minute cross-project knowledge synthesis...');

  const kb = loadKnowledgeBase();
  const projects = listProjects();

  projects.forEach((pId) => {
    const pFolder = getProjectFolder(pId);
    let files = [];
    if (fs.existsSync(pFolder)) {
      try {
        files = fs.readdirSync(pFolder);
      } catch (e) {}
    }
    const projAgents = Object.values(hrSystem)
      .filter((a) => a.project === pId)
      .map((a) => a.name);
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
  appendAgentThought(
    'senior-analyst-diviner',
    'SYNTHESIS_COMPLETE',
    `Knowledge Base updated with ${projects.length} project telemetry profiles.`
  );
  appendToSharedLog(
    `Senior Analyst completed synthesis. Company Knowledge Base updated with ${projects.length} projects.`
  );

  return { success: true, timestamp: new Date().toISOString(), projectCount: projects.length };
}

export function startSeniorAnalystScheduler(intervalMs = 300000) {
  return setInterval(() => {
    runSeniorAnalystInspection();
  }, intervalMs);
}
