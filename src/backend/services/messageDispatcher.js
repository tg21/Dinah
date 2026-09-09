import { loadHrSystem } from './hrService.js';
import { spawnHarnessAgent } from './harnessRunner.js';
import { appendAgentThought } from './messageService.js';
import { claimMessage, getQueuedAgents, listInbox, failMessage } from './messageQueueService.js';

const activeWakeups = new Set();
let timer;

function dispatchAgent(agentId) {
  if (activeWakeups.has(agentId)) return;
  const agent = loadHrSystem()[agentId];
  if (!agent || !['active', 'working'].includes(agent.status)) return;
  const inbox = listInbox({ agentId, limit: 10 });
  const next = inbox.find((message) => message.deliveryStatus === 'queued');
  if (!next) return;
  let claim;
  try {
    claim = claimMessage({ messageId: next.messageId, agentId });
  } catch (error) {
    return;
  }
  activeWakeups.add(agentId);
  const messages = listInbox({ agentId, limit: 10 }).filter((message) => message.deliveryStatus === 'claimed' || message.deliveryStatus === 'queued');
  const prompt = [
    'You have been woken by the Dinah durable message dispatcher.',
    `Claimed message ${claim.message.messageId} with lease token ${claim.leaseToken}.`,
    'Acknowledge it with acknowledge_message, process the request, then call complete_message with the same lease token. If you cannot process it, call fail_message or release_message.',
    'Bounded inbox batch:',
    JSON.stringify(messages.map(({ messageId, deliveryId, projectId, senderAgentId, type, summary, payload }) => ({ messageId, deliveryId, projectId, senderAgentId, type, summary, payload })), null, 2)
  ].join('\n\n');
  try {
    appendAgentThought(agentId, 'MESSAGE_WAKE', `Dispatcher claimed ${claim.message.messageId}.`);
    spawnHarnessAgent(agent.harness || 'opencode', agent.project || 'global', prompt, agentId);
  } catch (error) {
    try { failMessage({ messageId: claim.message.messageId, agentId, leaseToken: claim.leaseToken, reason: error.message, retryable: true }); } catch { /* lease recovery handles a crash */ }
  } finally {
    activeWakeups.delete(agentId);
  }
}

export function dispatchQueuedMessages() {
  for (const agentId of getQueuedAgents()) dispatchAgent(agentId);
}

export function startMessageDispatcher() {
  if (timer) return;
  timer = setInterval(dispatchQueuedMessages, 5000);
  timer.unref?.();
  dispatchQueuedMessages();
}

