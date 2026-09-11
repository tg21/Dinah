import { useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import { OVERSEER_IDS } from '../../constants/roles.js';

function deliveryState(message, effectiveAgentId) {
  const delivery = message.deliveries?.find((item) => item.recipientAgentId === effectiveAgentId) || message.deliveries?.[0];
  if (message.senderAgentId === effectiveAgentId && !delivery) return 'sent';
  return delivery?.status || message.status || 'queued';
}

function isInvolved(message, effectiveAgentId) {
  if (!effectiveAgentId) return true;
  if (message.senderAgentId === effectiveAgentId) return true;
  if (message.recipientAgentId === effectiveAgentId) return true;
  if (message.deliveries?.some((item) => item.recipientAgentId === effectiveAgentId)) return true;
  // Project-channel broadcast (no direct recipient) is visible to everyone in the project.
  if (!message.recipientAgentId) return true;
  return false;
}

function isPrivilegedViewer(agent, effectiveAgentId) {
  if (!agent && !effectiveAgentId) return false;
  if (OVERSEER_IDS.includes(effectiveAgentId)) return true;
  const role = agent?.role || '';
  if (role === 'manager-bard') return true;
  if (OVERSEER_IDS.includes(role)) return true;
  return false;
}

function ticks(status) {
  if (status === 'completed') return <span className="message-ticks blue">✓✓</span>;
  if (['claimed', 'processing'].includes(status)) return <span className="message-ticks">✓✓</span>;
  if (status === 'dead-lettered' || status === 'failed') return <span className="message-ticks failed">!</span>;
  return <span className="message-ticks">✓</span>;
}

export default function NetworkTab() {
  const { messageActivity, allAgents, currentAgentId, currentProjectId, drawerAgent } = useApp();
  const [expanded, setExpanded] = useState(null);
  const effectiveAgentId = drawerAgent?.id || currentAgentId;
  const effectiveAgent = (drawerAgent?.id ? drawerAgent : allAgents[effectiveAgentId]) || {};
  const privileged = isPrivilegedViewer(effectiveAgent, effectiveAgentId);
  const messages = messageActivity
    .filter((message) => message.projectId === currentProjectId || message.projectId === 'global')
    .filter((message) => privileged || isInvolved(message, effectiveAgentId));

  return (
    <>
      <div className="section-title">
        <i className="fa-solid fa-envelope-open-text" /> Agent Communications
        <span className="network-live-pill"><i className="fa-solid fa-circle" /> LIVE</span>
      </div>
      <div className="network-subtitle">Durable inbox traffic · click a message to inspect delivery</div>
      {!messages.length ? (
        <div className="network-empty"><i className="fa-regular fa-envelope" /> No agent messages yet.</div>
      ) : (
        <div className="communication-list">
          {messages.map((message) => {
            const outgoing = message.senderAgentId === effectiveAgentId;
            const receiverId = message.recipientAgentId || message.deliveries?.[0]?.recipientAgentId;
            const sender = allAgents[message.senderAgentId]?.name || message.senderAgentId;
            const receiver = allAgents[receiverId]?.name || receiverId || 'Project channel';
            const status = deliveryState(message, effectiveAgentId);
            const open = expanded === message.messageId;
            return (
              <button className={`communication-row ${outgoing ? 'outgoing' : 'incoming'} ${open ? 'expanded' : ''}`} key={message.messageId} onClick={() => setExpanded(open ? null : message.messageId)}>
                <div className="communication-row-meta">
                  <strong>{outgoing ? `To ${receiver}` : `From ${sender}`}</strong>
                  <span>{message.createdAt ? new Date(message.createdAt).toLocaleTimeString() : ''} {ticks(status)}</span>
                </div>
                <div className="communication-row-summary">{message.summary || message.payload?.message || 'Message'}</div>
                {open && (
                  <div className="communication-row-detail">
                    <div><span>Sender</span>{sender}</div>
                    <div><span>Recipient</span>{receiver}</div>
                    <div><span>Status</span>{status.replace('-', ' ')}</div>
                    <p>{message.payload?.message || message.summary || 'No message content'}</p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
