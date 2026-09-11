// In-memory inter-agent event queue (drives the Courier delivery animation
// + live roster/message invalidation via SSE on /api/events/stream).

let agentEventQueue = [];

const sseClients = new Set();

export function addSseClient(res) {
  sseClients.add(res);
}

export function removeSseClient(res) {
  sseClients.delete(res);
}

function pushToSseClients(eventObj) {
  if (!sseClients.size) return;
  const payload = `data: ${JSON.stringify(eventObj)}\n\n`;
  for (const res of [...sseClients]) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

export function broadcastAgentEvent(event) {
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
  pushToSseClients(eventObj);
  return eventObj;
}

export function getAgentEventQueue() {
  return agentEventQueue;
}

export function clearAgentEventQueue() {
  agentEventQueue = [];
}
