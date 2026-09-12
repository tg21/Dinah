import fs from 'fs';
import path from 'path';
import { HR_SYSTEM_DIR, SHARED_STATE_DIR } from '../config.js';

// ------------------------------------------------------------
// Agent message logs & thought stream
// ------------------------------------------------------------

export function getAgentMessageFile(agentId) {
  return path.join(HR_SYSTEM_DIR, `agent-${agentId}.msgs.json`);
}

export function getAgentThoughtFile(agentId) {
  return path.join(HR_SYSTEM_DIR, `agent-${agentId}.thoughts.json`);
}

export function loadAgentMessages(agentId) {
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

export function appendAgentMessage(agentId, { from, project, request, path: filePath, role = 'agent', deliveryId = null, messageId = null, simulated = false, kind = null, options = null }) {
  const messages = loadAgentMessages(agentId);
  // Guard against duplicate queue projections (delivery-ID marker).
  if (deliveryId && messages.messages.some((m) => m.deliveryId === deliveryId)) return;
  messages.messages.push({
    from,
    role,
    project,
    request,
    path: filePath,
    timestamp: new Date().toISOString(),
    ...(deliveryId ? { deliveryId } : {}),
    ...(messageId ? { messageId } : {}),
    ...(simulated ? { simulated: true } : {}),
    ...(kind ? { kind } : {}),
    ...(Array.isArray(options) && options.length ? { options } : {})
  });
  fs.writeFileSync(getAgentMessageFile(agentId), JSON.stringify(messages, null, 2));
}

export function loadAgentThoughts(agentId) {
  const file = getAgentThoughtFile(agentId);
  if (!fs.existsSync(file)) {
    return [
      {
        timestamp: new Date().toISOString(),
        step: 'IDLE',
        thought: 'Awaiting instructions or initiative from leadership.'
      }
    ];
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return [];
  }
}

export function appendAgentThought(agentId, step, thought) {
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

// ------------------------------------------------------------
// Shared channel / audit log
// ------------------------------------------------------------

export function getSharedStateLogFile() {
  return path.join(SHARED_STATE_DIR, 'shared-state.log');
}

export function appendToSharedLog(message) {
  const logEntry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(getSharedStateLogFile(), logEntry);
}
