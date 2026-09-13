import { AGENT_PALETTES } from './agentPalettes.js';

// Resolve the persisted look for an agent record. Backend stores
// `agent.appearance = { paletteId, variant }` in hr-system.json at creation;
// legacy records without one fall back to a stable hash so they don't
// flicker between renders.
export function appearanceForAgent(agent = {}, agentId = '') {
  if (agent.appearance && typeof agent.appearance.paletteId === 'number') return agent.appearance;
  let h = 0;
  const s = String(agentId || agent.id || agent.role || 'agent');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return { paletteId: h % AGENT_PALETTES.length, variant: Math.floor(h / 7) % 3 };
}

export function randomAppearance() {
  return {
    paletteId: Math.floor(Math.random() * AGENT_PALETTES.length),
    variant: Math.floor(Math.random() * 3)
  };
}
