import { paletteById } from './agentPalettes.js';
import { appearanceForAgent } from './appearance.js';

// Round profile portrait reusing the same palette/appearance as the sprite.
export default function AgentAvatar({ agent, agentId, size = 44 }) {
  const appearance = appearanceForAgent(agent, agentId);
  const palette = paletteById(appearance.paletteId);
  return (
    <svg className="agent-avatar-svg" width={size} height={size} viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill={palette.cloak} />
      <circle cx="16" cy="16" r="15" fill="none" stroke={palette.trim} strokeWidth="2" />
      <rect x="10" y="11" width="12" height="10" fill={palette.skin} />
      <rect x="12" y="14" width="2.5" height="2.5" fill="#4A3B32" />
      <rect x="18" y="14" width="2.5" height="2.5" fill="#4A3B32" />
      <rect x="10" y="11" width="12" height="2.5" fill={palette.hat} />
      {appearance.variant === 2 && (<><rect x="10" y="13" width="2" height="5" fill={palette.hat} /><rect x="20" y="13" width="2" height="5" fill={palette.hat} /></>)}
      <rect x="8" y="22" width="16" height="6" fill={palette.trim} />
      <rect x="14" y="22" width="4" height="6" fill={palette.cloak} />
    </svg>
  );
}
