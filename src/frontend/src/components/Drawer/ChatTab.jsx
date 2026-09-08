import { useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import { api } from '../../api/client.js';
import { escapeHtml, splitLongText } from '../../utils/format.js';
import { QUICK_PROMPTS } from '../../constants/startup.js';

function LogText({ value }) {
  const [expanded, setExpanded] = useState(false);
  const { collapsed, text, preview } = splitLongText(value);
  if (!collapsed) return <div style={{ whiteSpace: 'pre-wrap' }}>{escapeHtml(text)}</div>;
  return (
    <details className="log-details" open={expanded} onToggle={(e) => setExpanded(e.target.open)}>
      <summary>
        {escapeHtml(preview)} <strong>[show {expanded ? 'less' : 'more'}]</strong>
      </summary>
      <div className="log-detail-content">{escapeHtml(text)}</div>
    </details>
  );
}

export default function ChatTab({ engineRef }) {
  const {
    drawerAgent,
    allAgents,
    currentAgentId,
    currentProjectId,
    defaultHarness,
    loadAgents,
    loadAgentDrawer
  } = useApp();
  const [input, setInput] = useState('');
  const [optimistic, setOptimistic] = useState([]);

  const agent = drawerAgent || allAgents[currentAgentId] || {};
  const messages = agent.messages || [];
  const awaiting = agent.status === 'awaiting-confirmation';
  const cost = agent.costEstimation || { estCostUsd: 0.015, estTotalTokens: 4500 };

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput('');
    setOptimistic((o) => [...o, { role: 'user', content: msg, timestamp: Date.now() }]);
    engineRef.current?.launchCourier('user', currentAgentId);
    engineRef.current?.say(currentAgentId, 'Processing directive...');
    try {
      await api.sendMessage({
        agentId: currentAgentId,
        projectId: currentProjectId,
        message: msg,
        harness: defaultHarness
      });
      setOptimistic([]);
      await loadAgentDrawer(currentAgentId);
      engineRef.current?.say(currentAgentId, 'Task completed!');
    } catch (err) {
      engineRef.current?.say(currentAgentId, `Error: ${err.message}`);
    }
  }

  async function confirmSummon() {
    await api.confirmSummon(currentAgentId);
    await loadAgents();
    await loadAgentDrawer(currentAgentId);
  }

  return (
    <>
      {awaiting && (
        <div
          style={{
            background: 'rgba(0,188,212,0.15)',
            border: '1px solid var(--cyan)',
            padding: 10,
            borderRadius: 8,
            marginBottom: 8
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
            <i className="fa-solid fa-wand-magic-sparkles" style={{ color: 'var(--cyan)' }} />{' '}
            Awaiting Summoning Confirmation
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0' }}>
            Est. Cost: ${Number(cost.estCostUsd).toFixed(4)} • Effort: {agent.effortLevel || 'High'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn-primary" style={{ flex: 1, padding: 5 }} onClick={confirmSummon}>
              <i className="fa-solid fa-check" /> Confirm Summoning
            </button>
          </div>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((m, i) => {
          const roleCls = m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'agent';
          const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';
          return (
            <div key={i} className={`msg-bubble ${roleCls}`}>
              <div className="msg-header">
                <strong>{m.role === 'user' ? 'You (Overseer)' : agent.name || 'Agent'}</strong>
                <span>{time}</span>
              </div>
            <LogText value={m.content || m.text || m.request || ''} />
            </div>
          );
        })}
        {optimistic.map((m, i) => (
          <div key={`opt-${i}`} className="msg-bubble user">
            <div className="msg-header">
              <strong>You (Overseer)</strong>
              <span>Just now</span>
            </div>
            <div>{escapeHtml(m.content)}</div>
          </div>
        ))}
      </div>
      <div className="chat-suggestions">
        {QUICK_PROMPTS.map(([label, prompt]) => (
          <button key={label} className="chip-btn" onClick={() => send(prompt)}>
            {label}
          </button>
        ))}
      </div>
      <div className="chat-input-box">
        <input
          type="text"
          placeholder="+ Type directive for this agent..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
        />
        <button onClick={() => send()}>
          <i className="fa-solid fa-paper-plane" />
        </button>
      </div>
    </>
  );
}
