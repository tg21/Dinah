import { useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import AgentAvatar from '../Agents/AgentAvatar.jsx';
import ChatTab from './ChatTab.jsx';
import StatsTab from './StatsTab.jsx';
import ThoughtsTab from './ThoughtsTab.jsx';
import ContextTab from './ContextTab.jsx';
import NetworkTab from './NetworkTab.jsx';
import { api } from '../../api/client.js';

const TABS = [
  ['chat', 'fa-comment-dots', 'Chat'],
  ['stats', 'fa-shield-halved', 'Stats'],
  ['thoughts', 'fa-brain', 'BTS', 'Behind the scenes: agent reasoning + delivery mechanics'],
  ['context', 'fa-database', 'Context'],
  ['network', 'fa-envelope-open-text', 'Messages']
];

export default function Drawer({ engineRef }) {
  const [tab, setTab] = useState('chat');
  const { drawerAgent, allAgents, currentAgentId, loadAgents, loadAgentDrawer, setActiveModal, setDrawerCollapsed } =
    useApp();

  const agent = drawerAgent || allAgents[currentAgentId] || {};
  const avatarId = agent.id || currentAgentId;

  async function togglePause() {
    if (!agent.id && !currentAgentId) return;
    const id = agent.id || currentAgentId;
    const current = allAgents[id];
    if (!current) return;
    const targetStatus = current.status === 'paused' ? 'active' : 'paused';
    await api.setAgentStatus(id, targetStatus);
    await loadAgents();
    await loadAgentDrawer(id);
  }

  return (
    <aside className="drawer">
      <div className="drawer-header">
        <div className="drawer-agent-info">
          <div className="drawer-avatar-icon"><AgentAvatar agent={agent} agentId={avatarId} size={44} /></div>
          <div className="drawer-agent-meta">
            <h3>
              {agent.name || 'Manager Bard'}{' '}
              <span className={`status-badge ${agent.status || 'active'}`}>
                {agent.status === 'awaiting-user' ? 'needs your answer' : (agent.status || 'Active').replace('-', ' ')}
              </span>
            </h3>
            <p>
              Level {agent.stats?.level || 15} {agent.role || 'manager-bard'}
            </p>
          </div>
        </div>
        <div className="drawer-actions">
          <button
            className="action-btn"
            onClick={() => setDrawerCollapsed(true)}
            title="Collapse side panel"
          >
            <i className="fa-solid fa-chevron-right" />
          </button>
          <button
            className="action-btn"
            onClick={togglePause}
            title="Pause/Resume Agent"
          >
            <i className={`fa-solid ${agent.status === 'paused' ? 'fa-play' : 'fa-pause'}`} />
          </button>
          <button
            className="action-btn"
            onClick={() => setActiveModal('agentEdit')}
            title="Configure Agent"
          >
            <i className="fa-solid fa-sliders" />
          </button>
          <button
            className="action-btn"
            onClick={() => setActiveModal('spawnAgent')}
            title="Summon Specialist"
          >
            <i className="fa-solid fa-plus" />
          </button>
        </div>
      </div>

      <div className="drawer-tabs">
        {TABS.map(([key, icon, label, title]) => (
          <button
            key={key}
            className={`tab-btn ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
            {...(title ? { title } : {})}
          >
            <i className={`fa-solid ${icon}`} /> {label}
          </button>
        ))}
      </div>

      <div className={`tab-panel ${tab === 'chat' ? 'active' : ''}`} id="tab-chat">
        {tab === 'chat' && <ChatTab engineRef={engineRef} />}
      </div>
      <div className={`tab-panel ${tab === 'stats' ? 'active' : ''}`} id="tab-stats">
        {tab === 'stats' && <StatsTab />}
      </div>
      <div className={`tab-panel ${tab === 'thoughts' ? 'active' : ''}`} id="tab-thoughts">
        {tab === 'thoughts' && <ThoughtsTab />}
      </div>
      <div className={`tab-panel ${tab === 'context' ? 'active' : ''}`} id="tab-context">
        {tab === 'context' && <ContextTab />}
      </div>
      <div className={`tab-panel ${tab === 'network' ? 'active' : ''}`} id="tab-network">
        {tab === 'network' && <NetworkTab />}
      </div>
    </aside>
  );
}
