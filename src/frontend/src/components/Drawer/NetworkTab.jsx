import { useApp } from '../../store/AppContext.jsx';
import { roleConf } from '../../constants/roles.js';

export default function NetworkTab() {
  const { allAgents, currentProjectId, selectAgent } = useApp();
  const network = Object.entries(allAgents).filter(
    ([, a]) => a.project === currentProjectId || a.project === 'global'
  );

  if (!network.length) {
    return <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No agents in network.</div>;
  }

  return (
    <>
      <div className="section-title">
        <i className="fa-solid fa-diagram-project" /> Active Collaboration Network
      </div>
      <div>
        {network.map(([id, agent]) => {
          const conf = roleConf(agent.role);
          return (
            <div key={id} className="network-card" onClick={() => selectAgent(id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{conf.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{agent.name || id}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{agent.role}</div>
                </div>
              </div>
              <span className={`status-badge ${agent.status || 'active'}`}>
                {(agent.status || 'active').replace('-', ' ')}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
