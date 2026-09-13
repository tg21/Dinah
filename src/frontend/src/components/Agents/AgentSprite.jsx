import { paletteById } from './agentPalettes.js';
import { silhouetteForRole } from './roleSilhouettes.js';
import { appearanceForAgent } from './appearance.js';

// Bitmap-style adventurer rendered as pixel SVG. All cosmetic choices come
// from props (palette + silhouette) — no hardcoded colors here.
// activity: 'idle' | 'walk' | 'cast' | 'flourish' | 'sleep' (driven by
// AgentsLayer/PlayAreaScene from agent status + wander state).
// Thought bubbles are hover-only; a soft ping dot marks agents with
// something to say.
function hashId(s) {
  let h = 0;
  const str = String(s || 'agent');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export default function AgentSprite({
  agent,
  agentId,
  silhouette: silhouetteProp,
  activity = 'idle',
  facing = 1,
  selected,
  thought,
  popup = false,
  onClick,
  style
}) {
  const appearance = appearanceForAgent(agent, agentId);
  const palette = paletteById(appearance.paletteId);
  const silhouette = silhouetteProp || silhouetteForRole(agent.role);
  const status = agent.status || 'active';
  const awaiting = status === 'awaiting-confirmation';
  const needsUser = status === 'awaiting-user';
  const paused = status === 'paused';
  const effectiveActivity = paused ? 'sleep' : activity;
  const ringColor = needsUser ? '#C9563C' : awaiting ? '#4E8D8B' : 'transparent';
  const shortThought = thought && thought.length > 90 ? `${thought.slice(0, 87)}…` : thought;
  // Nameplates skip the trailing " (project)" suffix — the project badge
  // already shows it. Full names stay everywhere else (drawer, rail).
  const displayName = String(agent.name || agentId).replace(/\s*\([^)]*\)\s*$/, '');
  const delay = `${(hashId(agentId) % 12) / 10}s`;

  return (
    <div
      className={`agent-sprite${selected ? ' selected' : ''} activity-${effectiveActivity}`}
      style={{ ...style, '--anim-delay': delay }}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title={agent.name || agentId}
    >
      <div className="sprite-ring" style={ringColor !== 'transparent' ? { borderColor: ringColor } : undefined} />
      <div className={`sprite-flip${facing < 0 ? ' flipped' : ''}`}>
        <svg className="sprite-svg" viewBox="0 0 48 64" width="72" height="96" shapeRendering="crispEdges">
          {/* legs (two-frame step when walking) */}
          <g className="leg leg-a">
            <rect x="18" y="46" width="5" height="10" fill={palette.pants} />
            <rect x="17" y="54" width="7" height="3" fill="#4A3B32" />
          </g>
          <g className="leg leg-b">
            <rect x="25" y="46" width="5" height="10" fill={palette.pants} />
            <rect x="24" y="54" width="7" height="3" fill="#4A3B32" />
          </g>
          {/* tunic */}
          <rect x="15" y="30" width="18" height="17" fill={palette.cloak} />
          <rect x="15" y="30" width="18" height="3" fill={palette.trim} />
          <rect x="15" y="44" width="18" height="3" fill={palette.trim} />
          <rect x="23" y="33" width="2" height="11" fill={palette.trim} opacity="0.6" />
          {/* idle arm */}
          <rect x="11" y="32" width="4" height="11" fill={palette.cloak} />
          <rect x="11" y="41" width="4" height="3" fill={palette.skin} />
          {/* tool arm (swings on cast / flourish) */}
          <g className="tool-arm">
            <rect x="33" y="32" width="4" height="11" fill={palette.cloak} />
            <rect x="33" y="41" width="4" height="3" fill={palette.skin} />
            <Tool silhouette={silhouette} palette={palette} />
            {(effectiveActivity === 'cast') && (
              <circle className="hand-glow" cx="37" cy="30" r="6" fill={palette.trim} />
            )}
          </g>
          {/* head */}
          <rect x="17" y="16" width="14" height="13" fill={palette.skin} />
          {/* ears */}
          {silhouette.ears === 'pointy' && (
            <>
              <rect x="14" y="20" width="3" height="3" fill={palette.skin} />
              <rect x="31" y="20" width="3" height="3" fill={palette.skin} />
            </>
          )}
          {silhouette.ears === 'fins' && (
            <>
              <rect x="14" y="18" width="3" height="6" fill={palette.trim} />
              <rect x="31" y="18" width="3" height="6" fill={palette.trim} />
            </>
          )}
          {/* eyes (closed when sleeping) */}
          {effectiveActivity === 'sleep' ? (
            <>
              <rect x="20" y="22" width="3" height="1.5" fill="#4A3B32" />
              <rect x="26" y="22" width="3" height="1.5" fill="#4A3B32" />
            </>
          ) : (
            <>
              <rect x="20" y="21" width="3" height="3" fill="#4A3B32" />
              <rect x="26" y="21" width="3" height="3" fill="#4A3B32" />
            </>
          )}
          {/* hair fringe variant */}
          {appearance.variant === 1 && <rect x="17" y="16" width="14" height="3" fill={palette.hat} />}
          {appearance.variant === 2 && (<><rect x="17" y="16" width="3" height="6" fill={palette.hat} /><rect x="28" y="16" width="3" height="6" fill={palette.hat} /></>)}
          <Hat silhouette={silhouette} palette={palette} />
        </svg>
      </div>
      <div className="sprite-shadow" />
      {effectiveActivity === 'sleep' && (
        <span className="sprite-zzz" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span>
      )}
      <div className="sprite-name">{displayName}</div>
      {(awaiting || needsUser || paused) && (
        <div className="sprite-status-line">{awaiting ? 'awaiting summons' : needsUser ? 'needs your answer' : 'sleeping'}</div>
      )}
      {shortThought && !paused && (
        <div className={popup ? 'sprite-bubble popup' : 'sprite-bubble'}>{shortThought}</div>
      )}
    </div>
  );
}

function Hat({ silhouette, palette }) {
  switch (silhouette.hat) {
    case 'crown':
      return (<><rect x="17" y="9" width="14" height="6" fill="#C9A227" /><rect x="17" y="9" width="3" height="3" fill="#FFF3CF" /><rect x="22.5" y="8" width="3" height="4" fill="#FFF3CF" /><rect x="28" y="9" width="3" height="3" fill="#FFF3CF" /></>);
    case 'pointed':
      return (<><rect x="15" y="11" width="18" height="4" fill={palette.hat} /><rect x="19" y="3" width="10" height="8" fill={palette.hat} /><rect x="22" y="0" width="4" height="3" fill={palette.trim} /></>);
    case 'halo':
      return (<><ellipse cx="24" cy="9" rx="9" ry="3" fill="none" stroke="#C9A227" strokeWidth="2" /><rect x="15" y="13" width="18" height="2" fill={palette.hat} /></>);
    case 'horns':
      return (<><rect x="13" y="10" width="4" height="7" fill="#FFFDF0" stroke="#4A3B32" strokeWidth="0.75" /><rect x="31" y="10" width="4" height="7" fill="#FFFDF0" stroke="#4A3B32" strokeWidth="0.75" /><rect x="17" y="13" width="14" height="3" fill={palette.hat} /></>);
    case 'hood':
      return (<><rect x="15" y="11" width="18" height="6" fill={palette.hat} /><rect x="15" y="15" width="3" height="8" fill={palette.hat} /><rect x="30" y="15" width="3" height="8" fill={palette.hat} /></>);
    case 'helm':
      return (<><rect x="16" y="9" width="16" height="7" fill={palette.trim} /><rect x="22" y="11" width="4" height="8" fill="#FFFDF0" /></>);
    case 'cap':
      return (<><rect x="16" y="11" width="16" height="5" fill={palette.hat} /><rect x="28" y="13" width="6" height="2" fill={palette.hat} /></>);
    case 'beret':
      return (<><rect x="17" y="11" width="13" height="4" fill={palette.hat} /><rect x="29" y="9" width="3" height="3" fill={palette.trim} /></>);
    case 'goggles':
    case 'spectacles':
      return (<><rect x="16" y="12" width="16" height="3" fill={palette.hat} /><rect x="20" y="20" width="9" height="1.5" fill="#4A3B32" /></>);
    case 'beads':
      return (<><rect x="17" y="33" width="14" height="2" fill="#C9A227" /><rect x="23" y="35" width="2" height="4" fill="#C9A227" /></>);
    case 'wreath':
      return (<><rect x="16" y="12" width="16" height="3" fill={palette.trim} /><rect x="18" y="11" width="3" height="2" fill={palette.cloak} /><rect x="27" y="11" width="3" height="2" fill={palette.cloak} /></>);
    case 'mask':
      return (<rect x="19" y="20" width="11" height="4" fill={palette.trim} />);
    case 'mitre':
      return (<><rect x="18" y="4" width="12" height="11" fill={palette.hat} /><rect x="23" y="4" width="2" height="11" fill={palette.trim} /></>);
    case 'skull':
      return (<><rect x="18" y="7" width="12" height="9" fill="#FFFDF0" stroke="#4A3B32" strokeWidth="0.75" /><rect x="21" y="10" width="2.5" height="2.5" fill="#4A3B32" /><rect x="26" y="10" width="2.5" height="2.5" fill="#4A3B32" /></>);
    case 'glow':
      return (<ellipse cx="24" cy="10" rx="8" ry="5" fill={palette.trim} opacity="0.45" />);
    case 'visor':
      return (<><rect x="16" y="11" width="16" height="4" fill={palette.trim} /><rect x="18" y="20" width="12" height="2" fill={palette.trim} /></>);
    case 'feather':
      return (<><rect x="15" y="12" width="18" height="3" fill={palette.hat} /><rect x="30" y="6" width="3" height="7" fill={palette.trim} /></>);
    case 'tentacles':
      return (<><rect x="15" y="22" width="3" height="8" fill={palette.skin} /><rect x="30" y="22" width="3" height="8" fill={palette.skin} /><rect x="16" y="12" width="16" height="4" fill={palette.hat} /></>);
    case 'cape':
      return (<><rect x="13" y="28" width="4" height="18" fill={palette.trim} /><rect x="16" y="12" width="16" height="3" fill={palette.hat} /></>);
    default:
      return (<rect x="16" y="12" width="16" height="3" fill={palette.hat} />);
  }
}

function Tool({ silhouette, palette }) {
  switch (silhouette.tool) {
    case 'staff': return (<><rect x="36" y="14" width="2.5" height="34" fill="#6B5D4F" /><rect x="34" y="10" width="6.5" height="6.5" fill={palette.trim} /></>);
    case 'sword': return (<><rect x="36" y="18" width="2.5" height="20" fill="#B9C4C4" /><rect x="34" y="36" width="6.5" height="2.5" fill="#9A7433" /></>);
    case 'lute': return (<><rect x="34" y="26" width="3" height="12" fill="#9A7433" /><rect x="32" y="36" width="7" height="7" fill="#C98F5A" /></>);
    case 'bow': return (<><rect x="36" y="20" width="2" height="22" fill="#6B5D4F" /><rect x="34" y="28" width="5" height="1.5" fill="#4A3B32" /></>);
    case 'daggers': return (<><rect x="10" y="34" width="2" height="8" fill="#B9C4C4" /><rect x="36" y="34" width="2" height="8" fill="#B9C4C4" /></>);
    case 'orb': return (<circle cx="37" cy="30" r="4" fill={palette.trim} />);
    case 'hammer': return (<><rect x="35" y="24" width="2.5" height="14" fill="#6B5D4F" /><rect x="32" y="20" width="8" height="5" fill="#8A7B6C" /></>);
    case 'axe': return (<><rect x="35" y="24" width="2.5" height="16" fill="#6B5D4F" /><rect x="33" y="20" width="7" height="6" fill="#B9C4C4" /></>);
    case 'brush': return (<><rect x="35" y="28" width="2.5" height="12" fill="#9A7433" /><rect x="34" y="24" width="4.5" height="5" fill={palette.trim} /></>);
    case 'wrench': return (<><rect x="35" y="28" width="2.5" height="12" fill="#8A7B6C" /><rect x="34" y="24" width="4.5" height="5" fill="#B9C4C4" /></>);
    case 'scroll': return (<rect x="34" y="28" width="5" height="9" fill="#FFFDF0" stroke="#4A3B32" strokeWidth="0.75" />);
    case 'quill': return (<><rect x="35" y="26" width="2" height="12" fill="#FFFDF0" /><rect x="34" y="23" width="4" height="4" fill={palette.trim} /></>);
    case 'flask': return (<><rect x="35" y="24" width="2" height="5" fill="#8A7B6C" /><rect x="33" y="29" width="6" height="7" fill={palette.trim} /></>);
    case 'chalice': return (<><rect x="34" y="26" width="6" height="4" fill={palette.trim} /><rect x="36" y="30" width="2" height="6" fill="#9A7433" /></>);
    case 'scythe': return (<><rect x="36" y="16" width="2.5" height="30" fill="#4A3B32" /><rect x="30" y="14" width="9" height="3" fill="#B9C4C4" /></>);
    case 'scepter': return (<><rect x="36" y="18" width="2.5" height="28" fill="#9A7433" /><rect x="34" y="14" width="6.5" height="5" fill="#C9A227" /></>);
    case 'badge': return (<rect x="12" y="34" width="5" height="5" fill="#FFFDF0" stroke="#4A3B32" strokeWidth="0.75" />);
    default: return null;
  }
}
