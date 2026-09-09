import crypto from 'crypto';

const activeTokens = new Map();

export function issueOrchestrationToken(agentId, projectId) {
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.set(token, { agentId, projectId, expiresAt: Date.now() + 120000 });
  return token;
}

export function revokeOrchestrationToken(token) {
  activeTokens.delete(token);
}

export function authenticateOrchestrationToken(token, agentId, projectId) {
  const grant = activeTokens.get(token);
  if (!grant || grant.expiresAt < Date.now()) {
    activeTokens.delete(token);
    return false;
  }
  return grant.agentId === agentId && grant.projectId === projectId;
}
