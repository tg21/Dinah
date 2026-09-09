import { useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import BrainView from './BrainView.jsx';

export default function ContextTab() {
  const [view, setView] = useState('files');
  const { drawerAgent, allAgents, currentAgentId } = useApp();
  const agent = drawerAgent || allAgents[currentAgentId] || {};
  const context = agent.context || {};
  const used = context.contextUsed || 1500;
  const limit = context.contextLimit || 128000;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const files = context.files || ['README.md'];

  return (
    <>
      <div className="context-switch-bar">
        <button
          className={`context-switch-btn ${view === 'files' ? 'active' : ''}`}
          onClick={() => setView('files')}
        >
          <i className="fa-solid fa-folder-tree" /> File Explorer
        </button>
        <button
          className={`context-switch-btn ${view === 'brain' ? 'active' : ''}`}
          onClick={() => setView('brain')}
        >
          <i className="fa-solid fa-brain" /> 3D Synaptic Brain
        </button>
      </div>

      <div className="context-meter-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: 'var(--text-muted)' }}>Context Usage:</span>
          <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
            {(used / 1000).toFixed(1)}k / {Math.round(limit / 1000)}k Tokens
          </span>
        </div>
        <div className="context-bar-wrap">
          <div className="context-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {view === 'files' ? (
        <div>
          <div className="section-title" style={{ marginBottom: 6 }}>
            <i className="fa-solid fa-folder-open" /> Project Workspace Files
          </div>
          <div className="file-tree">
            <div
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                marginBottom: 6,
                wordBreak: 'break-all'
              }}
            >
              <i className="fa-solid fa-folder" /> {context.projectFolder || 'projects/global'}
            </div>
            {files.map((f, i) => (
              <div key={i} className="file-item">
                <i className="fa-solid fa-file-lines" /> {f}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="section-title">
            <i className="fa-solid fa-circle-nodes" /> Context Vector Embeddings
          </div>
          <BrainView />
        </div>
      )}
    </>
  );
}
