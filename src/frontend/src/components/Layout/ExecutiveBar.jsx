import { OVERSEER_IDS, roleConf } from '../../constants/roles.js';
import { shortRoleName } from '../../utils/format.js';
import { useApp } from '../../store/AppContext.jsx';

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
          const conf = roleConf(agent.role);
          const isSelected = currentAgentId === id;
          const thought =
            agentThoughts[id]?.currentThought || 'Overseeing enterprise system health...';
          return (
            <div
              key={id}
              className={`exec-agent-card ${isSelected ? 'selected' : ''}`}
              onClick={() => selectAgent(id)}
            >
              <div className="exec-avatar-token" style={{ borderColor: conf.color }}>
                <span>{conf.icon}</span>
                <div className="level-badge">{agent.stats?.level || 16}</div>
              </div>
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
