// Deterministic meadow placement as FRACTIONS of the container (0..1).
// The scene multiplies by the real pixel box on every resize, so the whole
// meadow re-renders to exactly fill available space — nothing is ever
// cropped (cover-zoom) or letterboxed, and sprites never distort.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const OVERSEER_SPOTS = [
  { x: 560 / 1600, y: 165 / 1000 },
  { x: 680 / 1600, y: 170 / 1000 },
  { x: 800 / 1600, y: 168 / 1000 },
  { x: 920 / 1600, y: 170 / 1000 },
  { x: 1040 / 1600, y: 165 / 1000 }
];

function overseerIndex(id) {
  const order = ['ceo-warlock', 'hr-mind-flayer', 'staff-engineer-paladin', 'senior-analyst-diviner', 'marshall-agent-system-inspector'];
  const i = order.indexOf(id);
  return i === -1 ? hash(id) % OVERSEER_SPOTS.length : i;
}

function isOverseer(agentId, agent = {}) {
  if (agent.project === 'global') return true;
  return ['ceo-warlock', 'hr-mind-flayer', 'staff-engineer-paladin', 'senior-analyst-diviner', 'marshall-agent-system-inspector'].includes(agentId);
}

// Home-zone bounds as fractions { x0, x1, y0, y1 }.
export function boundsFor(agentId, agent = {}) {
  if (isOverseer(agentId, agent)) return { x0: 0.2, x1: 0.8, y0: 0.11, y1: 0.25 };
  return { x0: 0.06, x1: 0.94, y0: 0.38, y1: 0.92 };
}

export function positionForAgent(agentId, agent = {}, index = 0) {
  const h = hash(agentId);
  if (isOverseer(agentId, agent)) {
    const spot = OVERSEER_SPOTS[overseerIndex(agentId)];
    return { x: spot.x + ((h % 40) - 20) / 1600, y: spot.y + ((h % 16) - 8) / 1000 };
  }
  const role = String(agent.role || '');
  let base = { x: 770 / 1600, y: 620 / 1000 };
  if (role.includes('manager')) base = { x: 770 / 1600, y: 600 / 1000 };
  else if (role.includes('wizard')) base = { x: 520 / 1600, y: 600 / 1000 };
  else if (role.includes('cleric')) base = { x: 800 / 1600, y: 580 / 1000 };
  else if (role.includes('sorcerer')) base = { x: 1080 / 1600, y: 600 / 1000 };
  else if (role.includes('rogue')) base = { x: 610 / 1600, y: 720 / 1000 };
  else if (role.includes('warmage')) base = { x: 960 / 1600, y: 710 / 1000 };
  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: base.x + ((col - 1.5) * 70 + ((h % 36) - 18)) / 1600,
    y: base.y + (row * 64 + ((h % 28) - 14)) / 1000
  };
}
