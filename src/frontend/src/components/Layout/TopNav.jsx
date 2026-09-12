import { useApp } from '../../store/AppContext.jsx';

export default function TopNav() {
  const {
    projects,
    currentProjectId,
    switchProject,
    setActiveModal
  } = useApp();

  return (
    <header className="top-nav">
      <div className="brand">
        <i className="fa-solid fa-dragon" />
        <span>DND AGENTS</span>
      </div>

      <div className="project-tabs">
        {projects.map((p) => (
          <button
            key={p}
            className={`project-tab ${p === currentProjectId ? 'active' : ''}`}
            onClick={() => switchProject(p)}
          >
            <i className="fa-solid fa-cube" /> {p}
          </button>
        ))}
        <button className="nav-btn" onClick={() => setActiveModal('newProject')}>
          <i className="fa-solid fa-plus" /> New
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
        <button className="nav-btn" onClick={() => setActiveModal('projectSettings')} title="Workspace Directory & Budget">
          <i className="fa-solid fa-folder-gear" /> Path &amp; Budget
        </button>
        <button className="nav-btn kb-btn" onClick={() => setActiveModal('knowledgeBase')} title="Company Knowledge Base">
          <i className="fa-solid fa-brain" /> Knowledge Base
        </button>
      </div>

      <div className="nav-actions">
        <div
          className="marshall-status"
          onClick={() => setActiveModal('marshallAudit')}
          title="Inspect Marshall Sentinel Prioritized Audit"
        >
          <div className="pulse-dot" />
          <span>Marshall Sentinel: Healthy</span>
        </div>
      </div>
    </header>
  );
}
