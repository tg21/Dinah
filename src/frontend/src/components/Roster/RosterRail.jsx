import { useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import AgentAvatar from '../Agents/AgentAvatar.jsx';

const STATUS_COLORS = {
  active: '#5E9E6E',
  working: '#9A7433',
  paused: '#C9563C',
  'awaiting-confirmation': '#4E8D8B',
  'awaiting-user': '#C9563C',
  obsolete: '#8A7B6C'
};

// BG3-style vertical party rail: project agents only (overseers stay in the
// top strip). Collapsible + scrollable, avatars reuse persisted appearance.
export default function RosterRail() {
  const { projectAgents, currentAgentId, selectAgent, currentProjectId } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const ids = Object.keys(projectAgents || {});

  return (
    <aside className={`roster-rail${collapsed ? ' collapsed' : ''}`} aria-label="Party roster">
      <button
        className="roster-collapse-btn"
        onClick={() => {
          setCollapsed((v) => {
            document.body.classList.toggle('rail-collapsed', !v);
            return !v;
          });
        }}
        title={collapsed ? 'Expand party' : 'Collapse party'}
      >
        <i className={`fa-solid fa-chevron-${collapsed ? 'right' : 'left'}`} />
      </button>
      <div className="roster-rail-head">Party · {ids.length}</div>
      <div className="roster-rail-list">
        {ids.length === 0 && (
          <div style={{ fontSize: 9, color: 'var(--ink-soft)', textAlign: 'center', padding: '8px 2px' }}>
            No party in {currentProjectId} yet — summon via +
          </div>
        )}
        {ids.map((id) => {
          const agent = projectAgents[id] || {};
          const selected = currentAgentId === id;
          return (
            <div
              key={id}
              className={`roster-slot${selected ? ' selected' : ''}`}
              onClick={() => selectAgent(id)}
              title={`${agent.name || id} (${agent.role || ''})`}
            >
              <AgentAvatar agent={agent} agentId={id} size={44} />
              <div className="roster-name">{agent.name || id}</div>
              <div className="roster-level">Lv {agent.stats?.level || 10}</div>
              <div
                className="status-dot"
                style={{ background: STATUS_COLORS[agent.status] || STATUS_COLORS.active }}
                title={agent.status || 'active'}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
