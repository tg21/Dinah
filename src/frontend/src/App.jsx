import { useEffect, useRef } from 'react';
import { AppProvider, useApp } from './store/AppContext.jsx';
import TopNav from './components/Layout/TopNav.jsx';
import ExecutiveBar from './components/Layout/ExecutiveBar.jsx';
import PlayArea from './components/PlayArea/PlayArea.jsx';
import Drawer from './components/Drawer/Drawer.jsx';
import StartupSetupModal from './components/Modals/StartupSetupModal.jsx';
import NewProjectModal from './components/Modals/NewProjectModal.jsx';
import ProjectSettingsModal from './components/Modals/ProjectSettingsModal.jsx';
import SpawnAgentModal from './components/Modals/SpawnAgentModal.jsx';
import AgentEditModal from './components/Modals/AgentEditModal.jsx';
import McpManagementModal from './components/Modals/McpManagementModal.jsx';
import KnowledgeBaseModal from './components/Modals/KnowledgeBaseModal.jsx';
import MarshallAuditModal from './components/Modals/MarshallAuditModal.jsx';
import { api } from './api/client.js';
import './styles/global.css';

function Shell() {
  const engineRef = useRef(null);
  const {
    drawerCollapsed,
    activeModal,
    setActiveModal,
    loadModelsHarnessesMcps,
    loadProjects,
    loadAgents,
    setAgentThoughts
  } = useApp();

  // Initial boot mirrors DOMContentLoaded in legacy frontend.html.
  useEffect(() => {
    (async () => {
      await loadModelsHarnessesMcps();
      try {
        const setup = await api.getStartupSetup();
        if (!setup.setup?.configured) setActiveModal('startupSetup');
      } catch {
        /* first-run check is best-effort */
      }
      await loadProjects();
      await loadAgents();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live thought polling (6s) for executive bar + canvas bubbles.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const t = await api.getThoughts();
        setAgentThoughts(t.thoughts || {});
      } catch {
        /* ignore transient failures */
      }
    }, 6000);
    return () => clearInterval(id);
  }, [setAgentThoughts]);

  useEffect(() => {
    document.body.classList.toggle('drawer-collapsed', drawerCollapsed);
  }, [drawerCollapsed]);

  return (
    <>
      <TopNav />
      <ExecutiveBar />
      <PlayArea engineRef={engineRef} />
      {!drawerCollapsed && <Drawer engineRef={engineRef} />}

      {activeModal === 'startupSetup' && <StartupSetupModal />}
      {activeModal === 'newProject' && <NewProjectModal />}
      {activeModal === 'projectSettings' && <ProjectSettingsModal />}
      {activeModal === 'spawnAgent' && <SpawnAgentModal />}
      {activeModal === 'agentEdit' && <AgentEditModal />}
      {activeModal === 'mcpManage' && <McpManagementModal />}
      {activeModal === 'knowledgeBase' && <KnowledgeBaseModal />}
      {activeModal === 'marshallAudit' && <MarshallAuditModal />}
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
