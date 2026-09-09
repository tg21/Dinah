// In-memory inter-agent event queue (drives the Courier delivery animation).

let agentEventQueue = [];

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
  return eventObj;
}

export function getAgentEventQueue() {
  return agentEventQueue;
}

export function clearAgentEventQueue() {
  agentEventQueue = [];
}
