import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { OVERSEER_IDS } from '../constants/roles.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [currentAgentId, setCurrentAgentId] = useState('ceo-warlock');
  const [currentProjectId, setCurrentProjectId] = useState('project-alpha');
  const [allAgents, setAllAgents] = useState({});
  const [agentThoughts, setAgentThoughts] = useState({});
  const [projectConfigs, setProjectConfigs] = useState({});
  const [projects, setProjects] = useState([]);
  const [models, setModels] = useState([]);
  const [harnesses, setHarnesses] = useState([]);
  const [mcps, setMcps] = useState([]);
  const [defaultHarness, setDefaultHarness] = useState('opencode');
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [drawerAgent, setDrawerAgent] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [messageActivity, setMessageActivity] = useState([]);
  const [mailFlights, setMailFlights] = useState([]);
  const [selectedCommunication, setSelectedCommunication] = useState(null);

  const loadModelsHarnessesMcps = useCallback(async () => {
    try {
      const [m, h, mc] = await Promise.all([
        api.getModels().catch(() => ({ models: [] })),
        api.getHarnesses().catch(() => ({ harnesses: [] })),
        api.getMcps().catch(() => ({ mcps: [] }))
      ]);
      setModels(m.models || []);
      setHarnesses(h.harnesses || []);
      setMcps(mc.mcps || []);
      // Keep the user's explicit choice when still detected; otherwise prefer
      // opencode, else the first detected harness — never a hardcoded vendor.
      const ids = (h.harnesses || []).map((x) => x.id);
      if (ids.length) {
        setDefaultHarness((cur) => (ids.includes(cur) ? cur : ids.includes('opencode') ? 'opencode' : ids[0]));
      }
    } catch (err) {
      console.error('Error loading dynamic system models:', err);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    const data = await api.getProjects().catch(() => null);
    if (!data) return;
    setProjectConfigs(data.config || {});
    setProjects(data.projects || []);
  }, []);

  const loadAgents = useCallback(async () => {
    const data = await api.getAgents().catch(() => null);
    if (!data) return;
    const agents = data.agents || {};
    setAllAgents(agents);
    try {
      const t = await api.getThoughts();
      setAgentThoughts(t.thoughts || {});
    } catch {
      /* thoughts are best-effort */
    }
    return agents;
  }, []);

  const loadMessageActivity = useCallback(async () => {
    const data = await api.getMessageActivity(currentProjectId).catch(() => null);
    if (data) setMessageActivity(data.messages || []);
  }, [currentProjectId]);

  const seenEvents = useRef(new Set());
  useEffect(() => {
    loadMessageActivity();
    const activityTimer = window.setInterval(loadMessageActivity, 4000);
    const eventTimer = window.setInterval(async () => {
      const data = await api.getEvents().catch(() => null);
      for (const event of data?.events || []) {
        if (seenEvents.current.has(event.id)) continue;
        seenEvents.current.add(event.id);
        if (event.type !== 'courier_message' || event.fromAgentId === 'user') continue;
        if (event.projectId && event.projectId !== currentProjectId) continue;
        const flight = { ...event, expiresAt: Date.now() + 30000 };
        setMailFlights((current) => [...current.filter((item) => item.messageId !== event.messageId), flight]);
        window.setTimeout(() => setMailFlights((current) => current.filter((item) => item.id !== event.id)), 30000);
      }
    }, 1500);
    return () => {
      window.clearInterval(activityTimer);
      window.clearInterval(eventTimer);
    };
  }, [currentProjectId, loadMessageActivity]);

  const loadAgentDrawer = useCallback(
    async (agentId) => {
      const id = agentId || currentAgentId;
      if (!id) return null;
      try {
        const data = await api.getAgentStatus(id, currentProjectId);
        if (data?.agent) {
          setDrawerAgent({
            ...data.agent,
            id,
            messages: data.messages || [],
            thoughts: data.thoughts || [],
            context: data.personalContext || {}
          });
        }
        return data;
      } catch (err) {
        console.error('loadAgentDrawer failed:', err);
        return null;
      }
    },
    [currentAgentId, currentProjectId]
  );

  const selectAgent = useCallback(
    async (agentId) => {
      setCurrentAgentId(agentId);
      await loadAgentDrawer(agentId);
    },
    [loadAgentDrawer]
  );

  const switchProject = useCallback(
    async (pId) => {
      setCurrentProjectId(pId);
    },
    []
  );

  // Keep derived roster + drawer in sync (mirrors loadAgentsAndRender).
  useEffect(() => {
    if (!Object.keys(allAgents).length) return;
    if (!allAgents[currentAgentId]) {
      const projectIds = Object.entries(allAgents)
        .filter(([, a]) => a.project === currentProjectId)
        .map(([id]) => id);
      setCurrentAgentId(projectIds[0] || 'ceo-warlock');
    }
  }, [allAgents, currentAgentId, currentProjectId]);

  useEffect(() => {
    if (currentAgentId) loadAgentDrawer(currentAgentId);
  }, [currentAgentId, currentProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { globalAgents, projectAgents } = useMemo(() => {
    const global = {};
    const project = {};
    for (const [id, agent] of Object.entries(allAgents)) {
      if (agent.project === 'global' || OVERSEER_IDS.includes(id)) global[id] = agent;
      else if (agent.project === currentProjectId) project[id] = agent;
    }
    return { globalAgents: global, projectAgents: project };
  }, [allAgents, currentProjectId]);

  const value = useMemo(
    () => ({
      currentAgentId,
      currentProjectId,
      allAgents,
      globalAgents,
      projectAgents,
      agentThoughts,
      projectConfigs,
      projects,
      models,
      harnesses,
      mcps,
      defaultHarness,
      drawerCollapsed,
      drawerAgent,
      activeModal,
      messageActivity,
      mailFlights,
      selectedCommunication,
      setCurrentAgentId,
      setCurrentProjectId,
      setAllAgents,
      setAgentThoughts,
      setMcps,
      setModels,
      setHarnesses,
      setDefaultHarness,
      setDrawerCollapsed,
      setDrawerAgent,
      setActiveModal,
      setSelectedCommunication,
      loadModelsHarnessesMcps,
      loadProjects,
      loadAgents,
      loadAgentDrawer,
      selectAgent,
      switchProject
    }),
    [
      currentAgentId,
      currentProjectId,
      allAgents,
      globalAgents,
      projectAgents,
      agentThoughts,
      projectConfigs,
      projects,
      models,
      harnesses,
      mcps,
      defaultHarness,
      drawerCollapsed,
      drawerAgent,
      activeModal,
      messageActivity,
      mailFlights,
      selectedCommunication,
      loadModelsHarnessesMcps,
      loadProjects,
      loadAgents,
      loadAgentDrawer,
      selectAgent,
      switchProject
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
