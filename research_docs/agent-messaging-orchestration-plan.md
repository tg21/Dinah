# Agent Messaging and Wake-Up Orchestration Plan

## Current assessment

The current `send_agent_message` behavior is incomplete. It appends text to the recipient's message log and emits a UI event, but the recipient agent does not automatically read that log, acknowledge receipt, claim the work, process the message, or wake up after the event. The UI event is animation/observability only; it is not an agent-delivery mechanism.

This means the current message is effectively an audit record, not a reliable message queue. It can be missed, duplicated by a future implementation, or remain unread indefinitely. There is currently no receipt acknowledgement, processing acknowledgement, completion acknowledgement, retry policy, consumer cursor, or idempotency key.

## Target behavior

Agents should communicate through a backend-mediated durable messaging system. MCP tools are the agent-facing interface, but the backend owns delivery state and lifecycle. A message should move through explicit states:

```text
queued -> claimed -> processing -> completed
                    |             |
                    +-> failed -> retrying -> dead-lettered
```

`send_message` must mean “accepted into the durable queue,” not “the recipient processed it.” The response should include a message ID, delivery ID, and current state.

## Message envelope

Every message should have a stable envelope rather than being stored as an unstructured log entry:

- `messageId`: immutable logical message ID for deduplication
- `deliveryId`: delivery attempt ID
- `projectId`: project scope or `global`
- `senderAgentId`
- `recipientAgentId` or channel/subscriber scope
- `threadId`: conversation or work-item context
- `type`: `request`, `status`, `blocker`, `help`, `approval`, `result`, or `notification`
- `payload`: structured data, with a short human-readable summary
- `createdAt`, `availableAt`, `expiresAt`
- `status`: queue/processing outcome
- `attemptCount`, `claimedAt`, `completedAt`
- `idempotencyKey`

The existing agent message logs should remain as read-only conversation/audit projections. They should not be the queue itself.

## Delivery and wake-up

Add a backend dispatcher/worker that consumes queued deliveries. It should:

1. Claim one message atomically using a lease.
2. Check whether the target agent is active, paused, already running, or retired.
3. Wake the target by starting or extending a harness invocation with a bounded “inbox batch.”
4. Pass message IDs and task context into the invocation.
5. Require the agent to acknowledge and complete each message through MCP tools.
6. Renew the lease while processing and retry after timeout.

The dispatcher must enforce one active wake-up per agent, or deliberately merge messages into one bounded batch, to avoid spawning overlapping conversations and wasting tokens.

An event bus can reduce latency, but a periodic recovery poll is still required so a process restart does not lose queued work. The worker should recover expired leases and requeue them.

## Acknowledgement and duplicate prevention

Receipt and completion are different events:

- `claim_message(messageId)`: the agent has received the delivery and owns it.
- `start_message(messageId)`: processing has begun.
- `complete_message(messageId, result)`: the requested work is complete.
- `fail_message(messageId, reason, retryable)`: processing failed.
- `release_message(messageId, reason)`: the agent cannot own it and returns it to the queue.

The backend must accept completion only from the current lease holder. It must record processed message IDs and enforce idempotency. If an agent restarts after completion, the dispatcher must not deliver the same completed message again. If a crash occurs after side effects but before completion, exactly-once execution cannot be assumed; handlers and task tools must therefore be idempotent and use task/message IDs as deduplication keys.

## One-to-one messages and common channels

Both modes are useful:

- One-to-one inboxes are for targeted requests, decisions, handoffs, and replies.
- Project channels are for announcements, blockers affecting multiple agents, milestone updates, and shared decisions.

The common channel should not be a firehose that every agent rereads. Agents should subscribe by project and message type, receive only new messages after a durable cursor, and use summaries/digests for low-priority updates. Managers should receive blocker/help events and task state changes by default.

Channel messages should still have a single delivery record per subscriber, allowing acknowledgement and retry without forcing every agent to process every message.

## MCP surface

The eventual orchestration MCP should expose at least:

- `send_direct_message`
- `publish_project_message`
- `list_inbox`
- `claim_message`
- `acknowledge_message`
- `complete_message`
- `fail_message`
- `get_message_status`
- `get_project_status`
- `create_task` / `update_progress`
- `report_blocker` / `request_help`

Agents should be instructed that progress, blockers, help requests, and completion are required protocol actions, not optional commentary. The MCP should return concise structured results so agents do not need to scan logs or the entire project.

## State and implementation direction

For the first reliable implementation, use a backend-owned durable store with atomic claims. A JSON file is acceptable for a prototype but is a poor long-running queue because concurrent claims and recovery are difficult. Prefer SQLite or another transactional local store once the message protocol is finalized.

Keep the event bus as a notification/wake-up optimization, not the source of truth. Keep agent logs as projections for UI and audit. Keep the queue, leases, acknowledgements, and processed-message records as the source of truth for delivery.

## Phased implementation

1. Define the envelope, state machine, idempotency rules, and MCP schemas.
2. Replace direct recipient-log writes with queue insertion plus an audit projection.
3. Add inbox listing, claim, acknowledgement, completion, failure, and status tools.
4. Add a single-agent dispatcher with lease recovery and bounded inbox batches.
5. Add direct-message subscriptions and project-channel subscriptions.
6. Add task/message correlation, manager blocker wake-ups, retries, dead-letter inspection, and UI delivery status.
7. Test crash recovery, duplicate delivery, simultaneous senders, paused agents, harness failure, and restart recovery before enabling autonomous dispatch broadly.

## Non-goals

This design does not make MCP itself a peer-to-peer transport. Agents remain isolated harness processes. The backend remains the authenticated broker, durable state owner, dispatcher, and authority for delivery and lifecycle decisions.
