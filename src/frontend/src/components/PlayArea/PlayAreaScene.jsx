import { useEffect, useMemo, useRef, useState } from 'react';
import BackdropLayer from './layers/BackdropLayer.jsx';
import WorldObjectsLayer from './layers/WorldObjectsLayer.jsx';
import AgentsLayer from './layers/AgentsLayer.jsx';
import CouriersLayer from './layers/CouriersLayer.jsx';
import { boundsFor, positionForAgent } from './layers/positions.js';

// Layered scene orchestrator. Keeps the legacy engineRef API
// (syncAgents / launchCourier / say / zoom / resetView) so ChatTab and
// PlayArea keep working with zero logic changes — only rendering changed.
//
// Fit layout: every world position is a FRACTION of the container, so the
// whole meadow re-renders to exactly fill available space whenever the
// party rail / agent drawer open or close (or the window resizes) —
// nothing is cropped, nothing letterboxed, sprites never distort.
// Zoom magnifies from that exact fit; panning is clamped to the zoomed
// world so blank space can never show.
//
// Liveliness is UI-only: a waypoint walker strolls each agent around its
// home zone, with idle weapon flourishes, a cast loop while `working`,
// and sleep while `paused`.
const TICK_MS = 150;
const WALK_SPEED = 0.03; // fraction of width per second
const ARRIVE = 0.004;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function pickWaypoint(base, bounds) {
  return {
    x: clamp(base.x + (Math.random() - 0.5) * 0.14, bounds.x0, bounds.x1),
    y: clamp(base.y + (Math.random() - 0.5) * 0.14, bounds.y0, bounds.y1)
  };
}

// Clamp pan (screen px) so the zoomed world always covers the container.
// At zoom 1 the fit is exact, so pan is forced to 0.
function clampPan(pan, zoom, cw, ch) {
  return {
    x: clamp(pan.x, cw * (1 - zoom), 0),
    y: clamp(pan.y, ch * (1 - zoom), 0)
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
  const [container, setContainer] = useState({ w: 0, h: 0 });
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const movedRef = useRef(false);

  const agents = useMemo(
    () => ({ ...globalAgents, ...projectAgents }),
    [globalAgents, projectAgents]
  );
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  // Track the real pixel box; layout changes (drawer/rail collapse,
  // window resize) re-fit the world automatically — and only then.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setContainer((prev) =>
        Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
          ? prev
          : { w: r.width, h: r.height }
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cw = container.w > 0 ? container.w : 1600;
  const ch = container.h > 0 ? container.h : 1000;

  // Re-clamp pan whenever the box changes so a resize can never strand
  // the world off-cover.
  useEffect(() => {
    setPan((p) => clampPan(p, zoom, cw, ch));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cw, ch]);

  function applyZoom(factor, anchorFx) {
    const nextZoom = clamp(zoom * factor, 1.0, 2.5);
    if (nextZoom === zoom) return;
    // Keep the anchor fraction pinned under the cursor.
    const ax = anchorFx?.x ?? 0.5;
    const ay = anchorFx?.y ?? 0.5;
    const next = clampPan(
      {
        x: pan.x + ax * cw * (zoom - nextZoom),
        y: pan.y + ay * ch * (zoom - nextZoom)
      },
      nextZoom,
      cw,
      ch
    );
    setPan(next);
    setZoom(nextZoom);
  }

  function zoomStep(factor) {
    applyZoom(factor, { x: 0.5, y: 0.5 });
  }

  function onWheel(e) {
    // Zoom toward the cursor: convert the screen point to fractions.
    const rect = containerRef.current?.getBoundingClientRect();
    let anchor;
    if (rect && cw > 0 && ch > 0) {
      anchor = {
        x: (e.clientX - rect.left - pan.x) / (cw * zoom),
        y: (e.clientY - rect.top - pan.y) / (ch * zoom)
      };
    }
    applyZoom(e.deltaY < 0 ? 1.12 : 0.89, anchor);
  }

  // Home bases are deterministic fractions per agent; wander state is too.
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
        const base = bases[agentId] || { x: 0.5, y: 0.6 };
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
        if (dist > ARRIVE) {
          const step = Math.min(dist, (WALK_SPEED * TICK_MS) / 1000);
          s.x += (dx / dist) * step;
          s.y += (dy / dist) * step;
          if (Math.abs(dx) > 0.002) s.facing = dx >= 0 ? 1 : -1;
        } else if (status !== 'working') {
          // Arrived: idle a beat, then wander, flourish, or rest.
          const roll = Math.random();
          s.waitUntil = now + 2000 + Math.random() * 5000;
          if (roll < 0.55) {
            const wp = pickWaypoint(base, boundsFor(agentId, agent));
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

  // Fractions → pixels: the only place container size enters the layout,
  // so a resize re-renders positions once, and nothing else re-renders.
  const positions = useMemo(() => {
    const out = {};
    for (const [id, s] of Object.entries(live)) {
      out[id] = { x: s.x * cw, y: s.y * ch, facing: s.facing };
    }
    for (const [id, base] of Object.entries(bases)) {
      if (!out[id]) out[id] = { x: base.x * cw, y: base.y * ch, facing: 1 };
    }
    return out;
  }, [live, bases, cw, ch]);

  const activities = useMemo(() => {
    const out = {};
    const now = Date.now();
    for (const [id, agent] of Object.entries(agents)) {
      const status = agent.status || 'active';
      const s = live[id];
      if (status === 'paused') out[id] = 'sleep';
      else if (status === 'working') out[id] = 'cast';
      else if (s && Math.hypot(s.tx - s.x, s.ty - s.y) > ARRIVE) out[id] = 'walk';
      else if (s && now < s.flourishUntil) out[id] = 'flourish';
      else out[id] = 'idle';
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, live]);

  // engineRef compatibility for PlayArea + ChatTab callers. The handle
  // is installed once; zoom implementations always see fresh state
  // through refs so pending speech-bubble timers are never dropped.
  const zoomStepRef = useRef(null);
  zoomStepRef.current = (f) => zoomStep(f);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
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
      zoom: (f) => zoomStepRef.current(f),
      resetView: () => {
        setZoom(1.0);
        setPan({ x: 0, y: 0 });
      },
      getZoom: () => zoomRef.current
    };
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      if (engineRef) engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineRef]);

  function onMouseDown(e) {
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y, sx: e.clientX, sy: e.clientY };
    movedRef.current = false;
  }
  function onMouseMove(e) {
    if (!dragRef.current) return;
    if (Math.hypot(e.clientX - dragRef.current.sx, e.clientY - dragRef.current.sy) > 6) {
      movedRef.current = true;
    }
    setPan(clampPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y }, zoom, cw, ch));
  }
  function onMouseUp() {
    dragRef.current = null;
  }
  // A drag-pan must not select the agent it ends on.
  function onClickCapture(e) {
    if (movedRef.current) {
      movedRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }

  return (
    <div
      className="play-scene"
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClickCapture={onClickCapture}
      onWheel={onWheel}
    >
      <div
        className="play-scene-inner"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        <BackdropLayer biome={backdrop} />
        <WorldObjectsLayer variant={objects} width={cw} height={ch} />
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
