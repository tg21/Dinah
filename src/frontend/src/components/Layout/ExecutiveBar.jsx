import { OVERSEER_IDS } from '../../constants/roles.js';
import { shortRoleName } from '../../utils/format.js';
import { useApp } from '../../store/AppContext.jsx';
import AgentAvatar from '../Agents/AgentAvatar.jsx';

export default function ExecutiveBar() {
  const { allAgents, agentThoughts, currentAgentId, selectAgent } = useApp();

  return (
    <section className="executive-outer-layer">
      <div className="outer-layer-tag">
        <i className="fa-solid fa-crown" /> Global Overseers
      </div>
      <div className="executive-roster">
        {OVERSEER_IDS.map((id) => {
          const agent = allAgents[id] || { name: id, role: id, stats: { level: 16 } };
          const isSelected = currentAgentId === id;
          const thought =
            agentThoughts[id]?.currentThought || 'Overseeing enterprise system health...';
          return (
            <div
              key={id}
              className={`exec-agent-card ${isSelected ? 'selected' : ''}`}
              onClick={() => selectAgent(id)}
            >
              <div className={`exec-avatar-token ${agent.status === 'awaiting-user' ? 'awaiting-user' : ''}`}>
                <AgentAvatar agent={agent} agentId={id} size={38} />
                <div className="level-badge">{agent.stats?.level || 16}</div>
              </div>
              {agent.status === 'awaiting-user' && <span className="status-badge awaiting-user">User input</span>}
              <div className="exec-info">
                <div className="exec-name-row">
                  <div className="exec-name">{agent.name || id}</div>
                  <div className="exec-role-title">{shortRoleName(agent.role)}</div>
                </div>
                <div className="exec-thought-preview">
                  <i className="fa-solid fa-brain" />
                  <span>{thought}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
