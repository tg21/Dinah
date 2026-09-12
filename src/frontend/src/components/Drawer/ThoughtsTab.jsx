import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import { splitLongText } from '../../utils/format.js';

export default function ThoughtsTab() {
  const { drawerAgent, allAgents, currentAgentId } = useApp();
  const [expanded, setExpanded] = useState({});
  const agent = drawerAgent || allAgents[currentAgentId] || {};
  const thoughts = agent.thoughts || [];
  const bottomRef = useRef(null);

  // BTS grows downward: settle on the latest entry when opened or extended.
  useEffect(() => {
    const panel = document.getElementById('tab-thoughts');
    if (panel) panel.scrollTop = panel.scrollHeight;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [thoughts.length, currentAgentId]);

  if (!thoughts.length) {
    return <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No behind-the-scenes activity yet.</div>;
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
                <summary>{preview} [show {isOpen ? 'less' : 'more'}]</summary>
                <div className="log-detail-content">{text}</div>
              </details>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
