import { useEffect, useMemo, useRef, useState } from 'react';
import BackdropLayer from './layers/BackdropLayer.jsx';
import WorldObjectsLayer from './layers/WorldObjectsLayer.jsx';
import AgentsLayer from './layers/AgentsLayer.jsx';
import CouriersLayer from './layers/CouriersLayer.jsx';
import { positionForAgent } from './layers/positions.js';

// Layered scene orchestrator. Keeps the legacy engineRef API
// (syncAgents / launchCourier / say / zoom / resetView) so ChatTab and
// PlayArea keep working with zero logic changes — only rendering changed.
export default function PlayAreaScene({
  engineRef,
  projectAgents,
  globalAgents,
  selectedId,
  thoughts,
  mails,
  allAgents,
  onPickAgent,
  onOpenMail,
  backdrop = 'meadow',
  objects = 'village'
}) {
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [bubbles, setBubbles] = useState({});
  const [drift, setDrift] = useState(0);
  const dragRef = useRef(null);
  void backdrop;

  const agents = useMemo(
    () => ({ ...globalAgents, ...projectAgents }),
    [globalAgents, projectAgents]
  );

  // Stable base positions per agent; gentle drift tick keeps the camp alive.
  const positions = useMemo(() => {
    const out = {};
    let idx = 0;
    for (const [id, agent] of Object.entries(agents)) {
      const base = positionForAgent(id, agent, idx++);
      const wobble = drift ? Math.sin(drift / 1000 + base.x) * 6 : 0;
      out[id] = { x: base.x + wobble, y: base.y };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, drift]);

  useEffect(() => {
    const id = setInterval(() => setDrift(Date.now()), 3000);
    return () => clearInterval(id);
  }, []);

  // engineRef compatibility for PlayArea + ChatTab callers.
  useEffect(() => {
    if (!engineRef) return;
    const timers = new Map();
    engineRef.current = {
      syncAgents: () => {},
      launchCourier: () => {},
      say(agentId, text, duration = 4.5) {
        setBubbles((b) => ({ ...b, [agentId]: text }));
        if (timers.has(agentId)) clearTimeout(timers.get(agentId));
        timers.set(
          agentId,
          setTimeout(() => setBubbles((b) => {
            const next = { ...b };
            delete next[agentId];
            return next;
          }), duration * 1000)
        );
      },
      zoom: (f) => setZoom((z) => Math.min(2.5, Math.max(1.0, z * f))),
      resetView: () => {
        setZoom(1.0);
        setPan({ x: 0, y: 0 });
      },
      getZoom: () => zoom
    };
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      if (engineRef) engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineRef]);

  function onMouseDown(e) {
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }
  function onMouseMove(e) {
    if (!dragRef.current) return;
    setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
  }
  function onMouseUp() {
    dragRef.current = null;
  }

  return (
    <div
      className="play-scene"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={(e) => setZoom((z) => Math.min(2.5, Math.max(1.0, z * (e.deltaY < 0 ? 1.08 : 0.92))))}
    >
      <div
        className="play-scene-inner"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        <BackdropLayer />
        <WorldObjectsLayer variant={objects} />
        <AgentsLayer
          agents={agents}
          positions={positions}
          selectedId={selectedId}
          thoughts={thoughts}
          bubbles={bubbles}
          onPick={onPickAgent}
        />
        <CouriersLayer mails={mails} positions={positions} allAgents={allAgents} onOpen={onOpenMail} />
      </div>
    </div>
  );
}
