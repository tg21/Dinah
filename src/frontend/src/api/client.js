// Thin fetch wrapper around the Express backend.
// In dev, Vite proxies /api + /handle* to localhost:2121 (see vite.config.js).
// In prod, the backend serves the built bundle from the same origin,
// so relative URLs keep working with no config.
const BASE = '';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.error || JSON.stringify(body);
    } catch {
      /* keep statusText */
    }
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  getAgents: () => req('/api/agents'),
  getThoughts: () => req('/api/agent-thoughts'),
  getAgentStatus: (agentId, projectId) =>
    req('/handleGetAgentStatus', {
      method: 'POST',
      body: JSON.stringify({ agentId, projectId })
    }),
  sendMessage: ({ agentId, projectId, message, harness }) =>
    req('/handleSendMessage', {
      method: 'POST',
      body: JSON.stringify({ agentId, projectId, message, harness })
    }),
  getProjects: () => req('/api/projects'),
  startProject: ({ projectId, customPath, budgetUsd }) =>
    req('/handleStartProject', {
      method: 'POST',
      body: JSON.stringify({ projectId, customPath, budgetUsd })
    }),
  saveProjectConfig: ({ projectId, customPath, budgetUsd, maxTokens }) =>
    req('/api/projects/config', {
      method: 'POST',
      body: JSON.stringify({ projectId, customPath, budgetUsd, maxTokens })
    }),
  getModels: () => req('/api/models'),
  getHarnesses: () => req('/api/harnesses'),
  getMcps: (agentId) => req(agentId ? `/api/mcps?agentId=${encodeURIComponent(agentId)}` : '/api/mcps'),
  getEvents: () => req('/api/events'),
  // Live event stream (SSE, same origin/port). Resolves roster/message
  // staleness without polling: backend pushes summon/spawn/status +
  // courier events as they happen. Returns an unsubscribe function.
  subscribeEvents: (onEvent) => {
    const source = new EventSource('/api/events/stream');
    source.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => source.close();
  },
  getMessageActivity: (projectId) => req(`/api/message-activity?projectId=${encodeURIComponent(projectId || 'global')}`),
  searchMcps: (q) => req(`/api/mcps/search?q=${encodeURIComponent(q)}`),
  installMcp: ({ serverName, version }) =>
    req('/api/mcps/install', {
      method: 'POST',
      body: JSON.stringify({ serverName, version })
    }),
  requestSummon: ({ role, projectId, model, effortLevel }) =>
    req('/api/agents/request-summon', {
      method: 'POST',
      body: JSON.stringify({ role, projectId, model, effortLevel })
    }),
  confirmSummon: (agentId) =>
    req('/api/agents/confirm-summon', {
      method: 'POST',
      body: JSON.stringify({ agentId })
    }),
  updateAgent: (agentId, updates) =>
    req('/api/agents/update', {
      method: 'POST',
      body: JSON.stringify({ agentId, updates })
    }),
  setAgentStatus: (agentId, status) =>
    req('/api/agents/set-status', {
      method: 'POST',
      body: JSON.stringify({ agentId, status })
    }),
  cancelAgent: (agentId, signal = 'SIGTERM') =>
    req('/api/agents/cancel', {
      method: 'POST',
      body: JSON.stringify({ agentId, signal })
    }),
  getStartupSetup: () => req('/api/startup-setup'),
  saveStartupSetup: ({ ceoModel, topLevelAssignments }) =>
    req('/api/startup-setup', {
      method: 'POST',
      body: JSON.stringify({ ceoModel, topLevelAssignments })
    }),
  getKnowledgeBase: () => req('/api/knowledge-base'),
  runAnalyst: () => req('/api/knowledge-base/run-analyst', { method: 'POST' }),
  getMarshallAudit: () => req('/api/marshall/audit'),
  runMarshall: () => req('/api/marshall/run', { method: 'POST' })
};
