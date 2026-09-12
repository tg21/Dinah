import { useEffect, useMemo, useRef, useState } from 'react';
import BackdropLayer from './layers/BackdropLayer.jsx';
import WorldObjectsLayer from './layers/WorldObjectsLayer.jsx';
import AgentsLayer from './layers/AgentsLayer.jsx';
import CouriersLayer from './layers/CouriersLayer.jsx';
import { positionForAgent } from './layers/positions.js';

// Layered scene orchestrator. Keeps the legacy engineRef API
// (syncAgents / launchCourier / say / zoom / resetView) so ChatTab and
// PlayArea keep working with zero logic changes — only rendering changed.
//
// Liveliness is UI-only: a waypoint walker strolls each agent around its
// home zone, with idle weapon flourishes, a cast loop while `working`,
// and sleep while `paused`.
const TICK_MS = 150;
const WALK_SPEED = 48; // world px per second

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function boundsFor(agent) {
  if (agent.project === 'global') return { x0: 320, x1: 1280, y0: 110, y1: 250 };
  return { x0: 90, x1: 1510, y0: 380, y1: 920 };
}

function pickWaypoint(base, bounds) {
  return {
    x: clamp(base.x + (Math.random() - 0.5) * 220, bounds.x0, bounds.x1),
    y: clamp(base.y + (Math.random() - 0.5) * 140, bounds.y0, bounds.y1)
  };
}

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
  const [live, setLive] = useState({});
  const dragRef = useRef(null);
  void backdrop;

  const agents = useMemo(
    () => ({ ...globalAgents, ...projectAgents }),
    [globalAgents, projectAgents]
  );
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  // Home bases are deterministic per agent; wander state lives in `live`.
  const bases = useMemo(() => {
    const out = {};
    let idx = 0;
    for (const [id, agent] of Object.entries(agents)) {
      out[id] = positionForAgent(id, agent, idx++);
    }
    return out;
  }, [agents]);

  useEffect(() => {
    const state = {};
    const id = setInterval(() => {
      const current = agentsRef.current;
      const now = Date.now();
      for (const [agentId, agent] of Object.entries(current)) {
        const base = bases[agentId] || { x: 800, y: 600 };
        let s = state[agentId];
        if (!s) {
          s = state[agentId] = {
            x: base.x, y: base.y, facing: 1,
            tx: base.x, ty: base.y, waitUntil: 0, flourishUntil: 0
          };
        }
        const status = agent.status || 'active';
        if (status === 'paused' || status === 'awaiting-confirmation') continue;
        if (now < s.waitUntil) continue;
        const dx = s.tx - s.x;
        const dy = s.ty - s.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 4) {
          const step = Math.min(dist, (WALK_SPEED * TICK_MS) / 1000);
          s.x += (dx / dist) * step;
          s.y += (dy / dist) * step;
          if (Math.abs(dx) > 2) s.facing = dx >= 0 ? 1 : -1;
        } else if (status !== 'working') {
          // Arrived: idle a beat, then wander, flourish, or rest.
          const roll = Math.random();
          s.waitUntil = now + 2000 + Math.random() * 5000;
          if (roll < 0.55) {
            const wp = pickWaypoint(base, boundsFor(agent));
            s.tx = wp.x;
            s.ty = wp.y;
          } else if (roll < 0.8) {
            s.flourishUntil = now + 3000;
          }
        }
      }
      // Always publish: drives walk/flourish transitions and keeps
      // `activities` fresh even while everyone stands still.
      setLive({ ...state });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [bases]);

  const positions = useMemo(() => {
    const out = {};
    for (const [id, s] of Object.entries(live)) {
      out[id] = { x: s.x, y: s.y, facing: s.facing };
    }
    for (const [id, base] of Object.entries(bases)) {
      if (!out[id]) out[id] = { x: base.x, y: base.y, facing: 1 };
    }
    return out;
  }, [live, bases]);

  const activities = useMemo(() => {
    const out = {};
    const now = Date.now();
    for (const [id, agent] of Object.entries(agents)) {
      const status = agent.status || 'active';
      const s = live[id];
      if (status === 'paused') out[id] = 'sleep';
      else if (status === 'working') out[id] = 'cast';
      else if (s && Math.hypot(s.tx - s.x, s.ty - s.y) > 4) out[id] = 'walk';
      else if (s && now < s.flourishUntil) out[id] = 'flourish';
      else out[id] = 'idle';
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, live]);

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
          activities={activities}
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
