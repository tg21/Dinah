import fs from 'fs';
import path from 'path';
import { MARSHALL_AUDIT_FILE } from '../config.js';
import { loadHrSystem, saveHrSystem } from './hrService.js';
import { getProjectFolder } from './projectService.js';
import { appendAgentThought, appendToSharedLog } from './messageService.js';
import { broadcastAgentEvent } from './eventBus.js';

export function loadMarshallAudit() {
  if (!fs.existsSync(MARSHALL_AUDIT_FILE)) {
    return { lastRun: null, priorityQueue: [], alerts: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(MARSHALL_AUDIT_FILE, 'utf-8'));
  } catch (e) {
    return { priorityQueue: [], alerts: [] };
  }
}

export function saveMarshallAudit(auditData) {
  fs.writeFileSync(MARSHALL_AUDIT_FILE, JSON.stringify(auditData, null, 2));
}

export function runMarshallChecks() {
  const hrSystem = loadHrSystem();
  const marshall = hrSystem['marshall-agent-system-inspector'];
  if (marshall && marshall.status === 'paused') {
    appendToSharedLog('Marshall Sentinel is paused. Skipping scheduled watchdog cycle.');
    return { skipped: true, reason: 'Marshall Sentinel is paused' };
  }

  appendAgentThought(
    'marshall-agent-system-inspector',
    'AUDIT_START',
    'Scanning active agents for context exhaustion and stuck processes...'
  );
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
      appendToSharedLog(
        `[MARSHALL ALERT] Context exhaustion critical (${percentUsed}%) for [${agentId}]. Generated handover document at ${handoverFile}`
      );
    }

    // Stuck process detection (> 10 mins idle while in 'working' status)
    if (agent.status === 'working' && idleMinutes > 10) {
      stuckAgents.push(agentId);
      agent.status = 'active'; // reset to active to unblock
      appendToSharedLog(
        `[MARSHALL RECOVERY] Unstuck stalled agent [${agentId}] (idle for ${idleMinutes}m). Reset status to active.`
      );
    }

    // Plan 01: awaiting-user watchdog. The hold is never auto-cleared, but if
    // the user-facing signal was missed (restart, dropped event), re-broadcast
    // it so the UI hold signal stays visible. Cap: only re-broadcast, nothing else.
    if (agent.status === 'awaiting-user' && agent.pendingUserQuestion && idleMinutes >= 10) {
      const openCount = Array.isArray(agent.pendingUserQuestions)
        ? agent.pendingUserQuestions.filter((q) => q.status === 'open').length
        : 1;
      const question = String(agent.pendingUserQuestion.question || '').slice(0, 80);
      broadcastAgentEvent({ fromAgentId: agentId, toAgentId: 'user', projectId: agent.project, type: 'agent_needs_user', questionId: agent.pendingUserQuestion.id, snippet: question });
      appendToSharedLog(`[MARSHALL WATCHDOG] Re-broadcast user-input hold for [${agentId}] (waiting ${idleMinutes}m, ${openCount} open). Hold preserved.`);
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
  appendAgentThought(
    'marshall-agent-system-inspector',
    'AUDIT_COMPLETE',
    `Audit finished. Prioritized ${priorityQueue.length} agents by context usage.`
  );

  return report;
}

export function startMarshallScheduler(intervalMs = 300000) {
  return setInterval(() => {
    try {
      runMarshallChecks();
    } catch (err) {
      console.error('Marshall Sentinel encountered an error during inspection:', err);
    }
  }, intervalMs);
}
