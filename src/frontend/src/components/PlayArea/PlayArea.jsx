import { useApp } from '../../store/AppContext.jsx';
import PlayAreaScene from './PlayAreaScene.jsx';
import { biomeLabel } from './layers/biomes.js';

// Layered adventure-map play area. Rendering lives in PlayAreaScene +
// layers/* (backdrop / objects / agents / couriers); this shell keeps badges,
// popover, and zoom controls wired to the same engineRef API.
export default function PlayArea({ engineRef }) {
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

  const pCfg = projectConfigs[currentProjectId] || { budgetUsd: 50.0 };
  const count = Object.keys(projectAgents).length;
  const biome = pCfg.biome || 'oasis';

  function openMail(mail) {
    const detail = messageActivity.find((item) => item.messageId === mail.messageId);
    setSelectedCommunication(detail || mail);
  }

  return (
    <main className="play-area" id="playArea">
      <PlayAreaScene
        engineRef={engineRef}
        projectAgents={projectAgents}
        globalAgents={globalAgents}
        selectedId={currentAgentId}
        thoughts={agentThoughts}
        mails={mailFlights}
        allAgents={allAgents}
        onPickAgent={(id) => selectAgent(id)}
        onOpenMail={openMail}
        backdrop={biome}
      />

      <div className="canvas-project-badge">
        <i className="fa-solid fa-layer-group" />
        <span>
          {currentProjectId.toUpperCase()} · {biomeLabel(biome)} ({count} adventurer{count === 1 ? '' : 's'})
        </span>
        <span className="canvas-budget-pill">${(pCfg.budgetUsd || 50).toFixed(2)} Budget</span>
      </div>

      <div className="canvas-tip">
        <i className="fa-solid fa-mouse-pointer" /> Click an adventurer to inspect • Drag to wander • Scroll to zoom
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
          title="Reset Meadow View"
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
      <div className="communication-status">{String(status).replace('-', ' ')} · {communication.createdAt ? new Date(communication.createdAt).toLocaleTimeString() : 'just now'}</div>
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
