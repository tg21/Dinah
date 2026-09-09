import { useApp } from '../../store/AppContext.jsx';

export default function TopNav() {
  const {
    projects,
    currentProjectId,
    switchProject,
    harnesses,
    defaultHarness,
    setDefaultHarness,
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
        <div className="harness-select-wrap">
          <i className="fa-solid fa-bolt" />
          <span>Default Harness:</span>
          <select value={defaultHarness} onChange={(e) => setDefaultHarness(e.target.value)}>
            {harnesses.length ? (
              harnesses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.modelCount ? ` (${h.modelCount} models)` : ''}
                </option>
              ))
            ) : (
              <>
                <option value="antigravity">Antigravity CLI (agy)</option>
                <option value="opencode">OpenCode CLI</option>
                <option value="claude-code">Claude Code</option>
                <option value="codex">Codex</option>
                <option value="gemini">Gemini CLI</option>
              </>
            )}
          </select>
        </div>

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
