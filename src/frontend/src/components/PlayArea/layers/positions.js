// Deterministic meadow placement so agents don't reshuffle every render.
// Overseers rest on the soft terrace (y~170); project parties camp around
// the tavern green. Small per-id jitter keeps parties organic.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const OVERSEER_SPOTS = [
  { x: 560, y: 165 },
  { x: 680, y: 170 },
  { x: 800, y: 168 },
  { x: 920, y: 170 },
  { x: 1040, y: 165 }
];

function overseerIndex(id) {
  const order = ['ceo-warlock', 'hr-mind-flayer', 'staff-engineer-paladin', 'senior-analyst-diviner', 'marshall-agent-system-inspector'];
  const i = order.indexOf(id);
  return i === -1 ? hash(id) % OVERSEER_SPOTS.length : i;
}

export function positionForAgent(agentId, agent = {}, index = 0) {
  const h = hash(agentId);
  const isOverseer = agent.project === 'global' || overseerSpot(agentId, agent) !== null;
  if (isOverseer) {
    const spot = OVERSEER_SPOTS[overseerIndex(agentId)];
    return { x: spot.x + ((h % 40) - 20), y: spot.y + ((h % 16) - 8) };
  }
  const role = String(agent.role || '');
  let base = { x: 770, y: 620 };
  if (role.includes('manager')) base = { x: 770, y: 600 };
  else if (role.includes('wizard')) base = { x: 520, y: 600 };
  else if (role.includes('cleric')) base = { x: 800, y: 580 };
  else if (role.includes('sorcerer')) base = { x: 1080, y: 600 };
  else if (role.includes('rogue')) base = { x: 610, y: 720 };
  else if (role.includes('warmage')) base = { x: 960, y: 710 };
  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: base.x + (col - 1.5) * 70 + ((h % 36) - 18),
    y: base.y + row * 64 + ((h % 28) - 14)
  };
}

function overseerSpot(agentId, agent) {
  if (agent.project === 'global') return true;
  const known = ['ceo-warlock', 'hr-mind-flayer', 'staff-engineer-paladin', 'senior-analyst-diviner', 'marshall-agent-system-inspector'];
  if (known.includes(agentId)) return true;
  return null;
}
