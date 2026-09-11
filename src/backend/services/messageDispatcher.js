import { loadHrSystem } from './hrService.js';
import { spawnHarnessAgent } from './harnessRunner.js';
import { appendAgentThought, appendToSharedLog } from './messageService.js';
import { claimMessage, completeMessage, getQueuedAgents, listInbox, failMessage } from './messageQueueService.js';

const activeWakeups = new Set();
let timer;

async function dispatchAgent(agentId) {
  if (activeWakeups.has(agentId)) return false;
  const agent = loadHrSystem()[agentId];
  if (!agent || !['active', 'working'].includes(agent.status)) return false;
  const inbox = listInbox({ agentId, limit: 10 });
  const next = inbox.find((message) => message.deliveryStatus === 'queued');
  if (!next) return false;
  let claim;
  try {
    claim = claimMessage({ messageId: next.messageId, agentId });
  } catch (error) {
    return false;
  }
  activeWakeups.add(agentId);
  const messages = listInbox({ agentId, limit: 10 }).filter((message) => message.deliveryStatus === 'claimed' || message.deliveryStatus === 'queued');
  const prompt = [
    'You have been woken by the Dinah durable message dispatcher.',
    `Claimed message ${claim.message.messageId} with lease token ${claim.leaseToken}.`,
    'Acknowledge it with acknowledge_message, process the request, then call complete_message with the same lease token. If you cannot process it, call fail_message or release_message.',
    'Inbox items are hints and may be stale (retries, restarts, parallel turns): FIRST call get_project_status for a fresh read, then act on current state, not on the message text alone.',
    'When creating a task to fulfill a request, pass that request message ID as idempotencyKey so re-processing never forks duplicates. If the worker already has an open task covering the need, complete the request with the task reference instead of creating.',
    'Bounded inbox batch:',
    JSON.stringify(messages.map(({ messageId, deliveryId, projectId, senderAgentId, type, summary, payload }) => ({ messageId, deliveryId, projectId, senderAgentId, type, summary, payload })), null, 2)
  ].join('\n\n');
  try {
    appendAgentThought(agentId, 'MESSAGE_WAKE', `Dispatcher claimed ${claim.message.messageId}.`);
    const result = await spawnHarnessAgent(agent.harness || 'opencode', agent.project || 'global', prompt, agentId);
    settleClaim({ agentId, claim, result, harness: agent.harness || 'opencode' });
    return true;
  } catch (error) {
    try { failMessage({ messageId: claim.message.messageId, agentId, leaseToken: claim.leaseToken, reason: error.message, retryable: true }); } catch { /* lease recovery handles a crash */ }
    return false;
  } finally {
    activeWakeups.delete(agentId);
  }
}

// Every dispatcher turn must settle its claim. Before this, a turn whose
// harness hard-failed (simulator fallback: canned text, zero MCP calls) left
// the delivery claimed-but-unfinished, so lease expiry re-queued it and the
// dispatcher burned turns on it forever (attempts climbing, no work done).
function settleClaim({ agentId, claim, result, harness }) {
  // The turn itself may have settled via MCP tools — never touch those.
  let current;
  try {
    current = listInbox({ agentId, limit: 20, includeCompleted: true })
      .find((m) => m.messageId === claim.message.messageId);
  } catch {
    return;
  }
  if (!current || ['completed', 'dead-lettered'].includes(current.deliveryStatus)) return;
  const args = { messageId: claim.message.messageId, agentId, leaseToken: claim.leaseToken };
  try {
    if (result?.simulated === true && harness !== 'system-simulator') {
      // The configured harness failed; the fallback did no tool work. Fail
      // retryable so a later turn (quota back, harness fixed) redelivers, and
      // dead-letters after MAX_ATTEMPTS instead of looping forever.
      failMessage({ ...args, reason: `Harness ${harness} failed; simulator fallback made no tool calls.`, retryable: true });
      appendAgentThought(agentId, 'DISPATCH_UNPRODUCTIVE', `Turn fell back to simulator; claim re-queued (attempt ${current.attemptCount}).`);
      appendToSharedLog(`Dispatcher: [${agentId}] harness [${harness}] failed, simulator fallback did no work; message re-queued (attempt ${current.attemptCount}).`);
    } else {
      completeMessage({ ...args, result: 'Consumed by dispatcher turn.' });
    }
  } catch {
    /* already settled inside the turn; idempotent paths cover the rest */
  }
}

// Plan 01 continuation: drain an agent's queued inbox with bounded turns.
// Each turn is event-grounded (a queued delivery exists); stops early when the
// agent pauses for the user (fresh ask_user hold) or the queue empties.
// No wall-clock timeouts — the cap is turns, not time.
export async function runContinuation(agentId, maxTurns = 5) {
  let turns = 0;
  while (turns < maxTurns) {
    const status = loadHrSystem()[agentId]?.status;
    if (status === 'awaiting-user') break;
    const ran = await dispatchAgent(agentId);
    if (!ran) break;
    turns += 1;
  }
  return { turns };
}

export async function dispatchQueuedMessages() {
  await Promise.all(getQueuedAgents().map((agentId) => dispatchAgent(agentId)));
}

export function startMessageDispatcher() {
  if (timer) return;
  timer = setInterval(dispatchQueuedMessages, 5000);
  timer.unref?.();
  dispatchQueuedMessages().catch(() => {});
}
