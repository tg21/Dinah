import { useEffect, useRef } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import { createLandscapeEngine } from './engine.js';

// Canvas play area. The engine instance lives in a ref; React state flows in
// via hook callbacks (selected agent + live thoughts) and syncAgents().
export default function PlayArea({ engineRef }) {
  const canvasRef = useRef(null);
  const {
    projectAgents,
    globalAgents,
    currentProjectId,
    projectConfigs,
    currentAgentId,
    agentThoughts,
    selectAgent,
    setActiveModal,
    setDrawerCollapsed,
    allAgents,
    mailFlights,
    messageActivity,
    selectedCommunication,
    setSelectedCommunication
  } = useApp();

  const selectedRef = useRef(currentAgentId);
  const thoughtsRef = useRef(agentThoughts);
  selectedRef.current = currentAgentId;
  thoughtsRef.current = agentThoughts;

  useEffect(() => {
    const engine = createLandscapeEngine(canvasRef.current, {
      getSelectedId: () => selectedRef.current,
      getThoughts: () => thoughtsRef.current,
      onPickAgent: (id) => selectAgent(id)
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    engineRef.current?.syncAgents(projectAgents, globalAgents);
  }, [projectAgents, globalAgents]); // eslint-disable-line react-hooks/exhaustive-deps

  const launchedMailRef = useRef(new Set());
  useEffect(() => {
    for (const mail of mailFlights) {
      if (launchedMailRef.current.has(mail.id)) continue;
      launchedMailRef.current.add(mail.id);
      engineRef.current?.launchCourier(mail.fromAgentId, mail.toAgentId);
    }
  }, [mailFlights]);

  const pCfg = projectConfigs[currentProjectId] || { budgetUsd: 50.0 };
  const count = Object.keys(projectAgents).length;

  return (
    <main className="play-area" id="playArea">
      <canvas id="landscapeCanvas" ref={canvasRef} />

      <div className="canvas-project-badge">
        <i className="fa-solid fa-layer-group" />
        <span>
          {currentProjectId.toUpperCase()} Playground ({count} active agent{count === 1 ? '' : 's'})
        </span>
        <span className="canvas-budget-pill">${(pCfg.budgetUsd || 50).toFixed(2)} Budget</span>
      </div>

      <div className="canvas-tip">
        <i className="fa-solid fa-mouse-pointer" /> Click agents to inspect • Drag to pan • Scroll
        to zoom [1.0x–2.5x]
      </div>

      <div className="mail-flight-layer" aria-label="Live agent messages">
        {mailFlights.map((mail, index) => {
          const sender = allAgents[mail.fromAgentId]?.name || mail.fromAgentId;
          const receiver = allAgents[mail.toAgentId]?.name || mail.toAgentId;
          const detail = messageActivity.find((item) => item.messageId === mail.messageId);
          return (
            <button
              key={mail.id}
              className="mail-flight"
              style={{ '--mail-lane': index % 3 }}
              onClick={() => setSelectedCommunication(detail || mail)}
              title="Open message details"
            >
              <i className="fa-solid fa-envelope" />
              <span>{sender} → {receiver}</span>
            </button>
          );
        })}
      </div>

      {selectedCommunication && (
        <CommunicationPopover
          communication={selectedCommunication}
          allAgents={allAgents}
          onClose={() => setSelectedCommunication(null)}
        />
      )}

      <div className="canvas-overlay-controls">
        <button className="canvas-btn" onClick={() => engineRef.current?.zoom(1.2)} title="Zoom In">
          <i className="fa-solid fa-plus" />
        </button>
        <button className="canvas-btn" onClick={() => engineRef.current?.zoom(0.8)} title="Zoom Out">
          <i className="fa-solid fa-minus" />
        </button>
        <button
          className="canvas-btn"
          onClick={() => engineRef.current?.resetView()}
          title="Reset Canvas View"
        >
          <i className="fa-solid fa-compress" />
        </button>
        <button
          className="canvas-btn"
          onClick={() => setActiveModal('spawnAgent')}
          title="HR Summon Specialist"
        >
          <i className="fa-solid fa-user-plus" />
        </button>
      </div>

      <DrawerToggle onToggle={() => setDrawerCollapsed((v) => !v)} />
    </main>
  );
}

function CommunicationPopover({ communication, allAgents, onClose }) {
  const senderId = communication.senderAgentId || communication.fromAgentId;
  const receiverId = communication.recipientAgentId || communication.toAgentId;
  const sender = allAgents[senderId]?.name || senderId;
  const receiver = allAgents[receiverId]?.name || receiverId;
  const delivery = communication.deliveries?.[0] || communication;
  const status = delivery.deliveryStatus || delivery.status || 'queued';
  return (
    <div className="communication-popover">
      <div className="communication-popover-head">
        <strong><i className="fa-solid fa-envelope-open-text" /> Message delivery</strong>
        <button onClick={onClose} aria-label="Close message"><i className="fa-solid fa-xmark" /></button>
      </div>
      <div className="communication-route"><span>{sender}</span><i className="fa-solid fa-arrow-right" /><span>{receiver}</span></div>
      <div className="communication-status">{status.replace('-', ' ')} · {communication.createdAt ? new Date(communication.createdAt).toLocaleTimeString() : 'just now'}</div>
      <div className="communication-body">{communication.payload?.message || communication.summary || communication.snippet || 'No message content'}</div>
    </div>
  );
}

function DrawerToggle({ onToggle }) {
  const { drawerCollapsed } = useApp();
  return (
    <div
      className="drawer-toggle-btn"
      onClick={onToggle}
      title="Toggle Side Panel"
      style={drawerCollapsed ? { right: 0 } : undefined}
    >
      <i className={`fa-solid fa-chevron-${drawerCollapsed ? 'left' : 'right'}`} />
    </div>
  );
}
