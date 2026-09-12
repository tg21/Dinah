import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';

function deliveryState(message, effectiveAgentId) {
  const delivery = message.deliveries?.find((item) => item.recipientAgentId === effectiveAgentId);
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

function ticks(status) {
  if (status === 'completed') return <span className="message-ticks blue">✓✓</span>;
  if (['claimed', 'processing'].includes(status)) return <span className="message-ticks">✓✓</span>;
  if (status === 'dead-lettered' || status === 'failed') return <span className="message-ticks failed">!</span>;
  return <span className="message-ticks">✓</span>;
}

export default function NetworkTab() {
  const { messageActivity, allAgents, currentAgentId, currentProjectId, drawerAgent } = useApp();
  const [expanded, setExpanded] = useState(null);
  const scrollRef = useRef(null);
  const effectiveAgentId = drawerAgent?.id || currentAgentId;
  // Agent-to-agent traffic only: user⇄agent exchanges live in the Chat tab,
  // never here. Chronological (oldest top, newest bottom).
  const messages = messageActivity
    .filter((message) => message.projectId === currentProjectId || message.projectId === 'global')
    .filter((message) => message.senderAgentId !== 'user')
    .filter((message) => isInvolved(message, effectiveAgentId))
    .slice()
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  // Settle on the latest message whenever this panel is (re)opened or grows.
  useEffect(() => {
    const panel = document.getElementById('tab-network');
    if (panel) panel.scrollTop = panel.scrollHeight;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, effectiveAgentId, currentProjectId]);

  return (
    <>
      <div className="section-title">
        <i className="fa-solid fa-envelope-open-text" /> Agent-to-Agent
        <span className="network-live-pill"><i className="fa-solid fa-circle" /> LIVE</span>
      </div>
      <div className="network-subtitle">Agent-to-agent traffic only · user chat stays in Chat</div>
      {!messages.length ? (
        <div className="network-empty"><i className="fa-regular fa-envelope" /> No agent messages yet.</div>
      ) : (
        <div className="communication-list" ref={scrollRef} style={{ overflowY: 'auto' }}>
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
