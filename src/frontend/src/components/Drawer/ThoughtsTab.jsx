import { useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import { escapeHtml, splitLongText } from '../../utils/format.js';

export default function ThoughtsTab() {
  const { drawerAgent, allAgents, currentAgentId } = useApp();
  const [expanded, setExpanded] = useState({});
  const agent = drawerAgent || allAgents[currentAgentId] || {};
  const thoughts = agent.thoughts || [];

  if (!thoughts.length) {
    return <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No thoughts logged yet.</div>;
  }

  return (
    <div className="thought-stream">
      {thoughts.map((t, i) => {
        const time = t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : '';
        const { collapsed, text, preview } = splitLongText(t.thought || t.content || '');
        const isOpen = !!expanded[i];
        return (
          <div key={i} className={`thought-card ${t.type || 'REASONING'}`}>
            <div className="thought-time">{time}</div>
            {t.type && <div className="thought-tag">{t.type}</div>}
            {collapsed ? (
              <details
                className="log-details"
                open={isOpen}
                onToggle={(e) =>
                  setExpanded((s) => ({ ...s, [i]: e.target.open }))
                }
              >
                <summary>{escapeHtml(preview)} [show {isOpen ? 'less' : 'more'}]</summary>
                <div className="log-detail-content">{escapeHtml(text)}</div>
              </details>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap' }}>{escapeHtml(text)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
