import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SHARED_STATE_DIR } from '../config.js';
import { appendAgentThought, appendToSharedLog } from './messageService.js';
import { broadcastAgentEvent } from './eventBus.js';

const QUEUE_FILE = path.join(SHARED_STATE_DIR, 'message-queue.json');
const MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 120000;

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
}

function emptyState() {
  return { version: 1, messages: [], deliveries: [], subscriptions: [] };
}

function loadState() {
  if (!fs.existsSync(QUEUE_FILE)) return emptyState();
  try {
    const state = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    return { ...emptyState(), ...state };
  } catch {
    return emptyState();
  }
}

function saveState(state) {
  const temp = `${QUEUE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, QUEUE_FILE);
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function recoverExpired(state, now = Date.now()) {
  let changed = false;
  for (const delivery of state.deliveries) {
    if (['claimed', 'processing'].includes(delivery.status) && delivery.leaseExpiresAt <= now) {
      delivery.status = 'queued';
      delivery.leaseToken = null;
      delivery.claimedAt = null;
      delivery.leaseExpiresAt = null;
      const message = state.messages.find((item) => item.messageId === delivery.messageId);
      if (message && message.status !== 'completed') message.status = 'queued';
      changed = true;
    }
  }
  return changed;
}

function queueThought(agentId, step, thought) {
  try {
    appendAgentThought(agentId, step, thought);
  } catch { /* BTS trace must never break delivery */ }
}

function publicMessage(message, delivery) {
  return {
    ...message,
    deliveryId: delivery?.deliveryId,
    deliveryStatus: delivery?.status,
    attemptCount: delivery?.attemptCount ?? message.attemptCount,
    claimedAt: delivery?.claimedAt ?? null,
    leaseExpiresAt: delivery?.leaseExpiresAt ?? null
  };
}

// Chat boxes are user-interaction only (user messages, ask_user questions,
// inform_user notices, direct harness replies). Durable agent-to-agent
// traffic is observable via message-activity, courier events, and the shared
// log — never via drawer projections, so no queue mechanics ([claimed],
// [completed], reply echoes) leak into the user's chat view. Delivery
// lifecycle instead leaves compact QUEUE_* thoughts on the recipient's BTS
// panel (best-effort; must never break delivery).

function createEnvelope({ projectId = 'global', senderAgentId, recipientAgentId = null, threadId = null, type = 'request', payload, summary, idempotencyKey }) {
  const sender = text(senderAgentId, 'senderAgentId');
  const project = text(projectId || 'global', 'projectId');
  const body = payload ?? { message: text(summary, 'message') };
  const key = idempotencyKey || id('idem');
  const state = loadState();
  recoverExpired(state);
  const existing = state.messages.find((item) => item.idempotencyKey === key);
  if (existing) {
    const delivery = state.deliveries.find((item) => item.messageId === existing.messageId && item.recipientAgentId === recipientAgentId);
    return { message: publicMessage(existing, delivery), duplicate: true };
  }
  const now = new Date().toISOString();
  const message = {
    messageId: id('msg'),
    projectId: project,
    senderAgentId: sender,
    recipientAgentId,
    threadId,
    type,
    payload: body,
    summary: summary || body.message || type,
    createdAt: now,
    availableAt: now,
    expiresAt: null,
    status: 'queued',
    attemptCount: 0,
    claimedAt: null,
    completedAt: null,
    idempotencyKey: key
  };
  state.messages.push(message);
  const recipients = recipientAgentId ? [recipientAgentId] : state.subscriptions
    .filter((item) => item.projectId === project && item.active !== false)
    .map((item) => item.agentId);
  for (const recipient of [...new Set(recipients)]) {
    state.deliveries.push({
      deliveryId: id('delivery'), messageId: message.messageId, recipientAgentId: recipient,
      status: 'queued', attemptCount: 0, claimedAt: null, leaseExpiresAt: null, leaseToken: null,
      lastError: null, completedAt: null
    });
  }
  saveState(state);
  const delivery = state.deliveries.find((item) => item.messageId === message.messageId && item.recipientAgentId === recipientAgentId);
  if (recipientAgentId) {
    // Chat-clean rule: no drawer copies (inbox or sent). Agent-to-agent
    // exchanges stay visible via courier event + message-activity + log.
    broadcastAgentEvent({
      fromAgentId: sender,
      toAgentId: recipientAgentId,
      type: 'courier_message',
      messageId: message.messageId,
      deliveryId: delivery?.deliveryId,
      projectId: project,
      summary: message.summary,
      snippet: message.summary.slice(0, 80)
    });
  }
  appendToSharedLog(`[${sender}] queued ${type} [${message.messageId}] in [${project}].`);
  return { message: publicMessage(message, delivery), duplicate: false };
}

export function enqueueDirectMessage(args) {
  return createEnvelope({ ...args, senderAgentId: args.senderAgentId || args.fromAgentId, recipientAgentId: text(args.toAgentId, 'toAgentId'), summary: text(args.message, 'message'), payload: { message: text(args.message, 'message') }, type: args.type || 'request' });
}

export function publishProjectMessage({ projectId, senderAgentId, message, type = 'notification', idempotencyKey }) {
  return createEnvelope({ projectId, senderAgentId, type, summary: text(message, 'message'), payload: { message: text(message, 'message') }, idempotencyKey });
}

export function subscribeToProject({ projectId, agentId }) {
  const state = loadState();
  const project = text(projectId, 'projectId');
  const agent = text(agentId, 'agentId');
  if (!state.subscriptions.some((item) => item.projectId === project && item.agentId === agent)) state.subscriptions.push({ projectId: project, agentId: agent, active: true, createdAt: new Date().toISOString() });
  saveState(state);
  return { subscribed: true, projectId: project, agentId: agent };
}

export function listInbox({ agentId, projectId, limit = 20, includeCompleted = false }) {
  const state = loadState();
  if (recoverExpired(state)) saveState(state);
  const deliveries = state.deliveries.filter((delivery) => delivery.recipientAgentId === text(agentId, 'agentId'))
    .filter((delivery) => !projectId || state.messages.find((item) => item.messageId === delivery.messageId)?.projectId === projectId)
    .filter((delivery) => includeCompleted || !['completed', 'dead-lettered'].includes(delivery.status))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
  return deliveries.map((delivery) => publicMessage(state.messages.find((item) => item.messageId === delivery.messageId), delivery));
}

function findDelivery(state, { messageId, agentId }) {
  const identifier = text(messageId, 'messageId');
  const agent = text(agentId, 'agentId');
  // Agents see both ids (get_message_status accepts either), so lease ops
  // resolve either one — scoped to the recipient so only the holder may mutate.
  return (
    state.deliveries.find((item) => item.messageId === identifier && item.recipientAgentId === agent) ||
    state.deliveries.find((item) => item.deliveryId === identifier && item.recipientAgentId === agent)
  );
}

function leaseAction({ messageId, agentId, leaseToken, status }) {
  const state = loadState();
  const delivery = findDelivery(state, { messageId, agentId });
  if (!delivery) throw new Error('Message delivery not found');
  if (delivery.status === 'completed') return { message: state.messages.find((item) => item.messageId === delivery.messageId), delivery, idempotent: true };
  // The matching holder may refresh even after the lease timestamp passed, as
  // long as the delivery was never reassigned (expiry recovery nulls the
  // token, so a matching token proves ownership). Only mismatched/missing
  // tokens are rejected — long harness turns otherwise fail their late ack.
  if (!leaseToken || delivery.leaseToken !== leaseToken) {
    throw new Error('Message lease is missing or expired');
  }
  delivery.status = status;
  delivery.leaseExpiresAt = Date.now() + DEFAULT_LEASE_MS;
  const message = state.messages.find((item) => item.messageId === delivery.messageId);
  message.status = status;
  saveState(state);
  return { message, delivery, idempotent: false };
}

export function claimMessage({ messageId, agentId, leaseMs = DEFAULT_LEASE_MS }) {
  const state = loadState();
  if (recoverExpired(state)) saveState(state);
  const delivery = findDelivery(state, { messageId, agentId });
  if (!delivery) throw new Error('Message delivery not found');
  if (delivery.status === 'completed') return { message: state.messages.find((item) => item.messageId === delivery.messageId), delivery, idempotent: true };
  if (!['queued'].includes(delivery.status)) throw new Error('Message is already claimed or processing');
  const now = Date.now();
  delivery.status = 'claimed';
  delivery.attemptCount += 1;
  delivery.claimedAt = new Date(now).toISOString();
  delivery.leaseExpiresAt = now + Math.max(1000, Math.min(600000, Number(leaseMs) || DEFAULT_LEASE_MS));
  delivery.leaseToken = crypto.randomBytes(24).toString('hex');
  const message = state.messages.find((item) => item.messageId === delivery.messageId);
  message.status = 'claimed'; message.attemptCount = delivery.attemptCount; message.claimedAt = delivery.claimedAt;
  saveState(state);
  queueThought(delivery.recipientAgentId, 'QUEUE_CLAIM', `Claimed delivery [${delivery.deliveryId}] of [${message.messageId}] from [${message.senderAgentId}]: ${String(message.summary).slice(0, 160)}`);
  return { message: publicMessage(message, delivery), delivery, leaseToken: delivery.leaseToken };
}

export function acknowledgeMessage(args) { return leaseAction({ ...args, status: 'processing' }); }
export function completeMessage({ messageId, agentId, leaseToken, result = null }) {
  const outcome = leaseAction({ messageId, agentId, leaseToken, status: 'completed' });
  const state = loadState();
  const delivery = findDelivery(state, { messageId, agentId });
  const message = state.messages.find((item) => item.messageId === delivery.messageId);
  delivery.completedAt = new Date().toISOString(); delivery.result = result;
  message.completedAt = delivery.completedAt; message.result = result; message.status = 'completed';
  saveState(state);
  queueThought(agentId, 'QUEUE_DONE', `Completed delivery [${delivery.deliveryId}] of [${message.messageId}] from [${message.senderAgentId}].`);
  return { ...outcome, message: publicMessage(message, delivery) };
}
export function failMessage({ messageId, agentId, leaseToken, reason, retryable = true }) {
  const state = loadState();
  const delivery = findDelivery(state, { messageId, agentId });
  if (!delivery || !leaseToken || delivery.leaseToken !== leaseToken) throw new Error('Message lease is missing or expired');
  delivery.lastError = text(reason, 'reason'); delivery.leaseToken = null; delivery.leaseExpiresAt = null;
  delivery.status = retryable && delivery.attemptCount < MAX_ATTEMPTS ? 'queued' : 'dead-lettered';
  const message = state.messages.find((item) => item.messageId === delivery.messageId); message.status = delivery.status;
  saveState(state);
  queueThought(agentId, 'QUEUE_FAIL', `Delivery [${delivery.deliveryId}] of [${message.messageId}] ${delivery.status === 'queued' ? 're-queued' : 'dead-lettered'}: ${String(reason).slice(0, 160)}`);
  return { message: publicMessage(message, delivery), retrying: delivery.status === 'queued' };
}
export function releaseMessage({ messageId, agentId, leaseToken, reason = 'released' }) { return failMessage({ messageId, agentId, leaseToken, reason, retryable: true }); }

export function getMessageStatus({ messageId }) {
  const state = loadState();
  const identifier = text(messageId, 'messageId');
  const message = state.messages.find((item) => item.messageId === identifier) ||
    state.messages.find((item) => state.deliveries.some((delivery) =>
      delivery.deliveryId === identifier && delivery.messageId === item.messageId
    ));
  if (!message) throw new Error('Message not found');
  return { message, deliveries: state.deliveries.filter((item) => item.messageId === message.messageId) };
}

export function getProjectMessageActivity({ projectId = 'global', limit = 100 }) {
  const state = loadState();
  if (recoverExpired(state)) saveState(state);
  // Chronological (oldest first, newest at bottom) like a normal message view.
  const messages = state.messages
    .filter((message) => message.projectId === projectId || projectId === 'all')
    .slice(-Math.max(1, Math.min(250, Number(limit) || 100)));
  return messages.map((message) => ({
    ...message,
    deliveries: state.deliveries.filter((delivery) => delivery.messageId === message.messageId)
  }));
}

export function getQueuedAgents() {
  const state = loadState();
  if (recoverExpired(state)) saveState(state);
  return [...new Set(state.deliveries.filter((item) => item.status === 'queued').map((item) => item.recipientAgentId))];
}
