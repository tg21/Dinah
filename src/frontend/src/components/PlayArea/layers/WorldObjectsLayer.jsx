// Layer 1 — D&D artefacts / buildings as soft SVG. Always z-index below
// agents (CSS .scene-layer.objects z1 vs .agents z10) so sprites are never
// obscured. Pointer-events none; purely decorative.
const INK = '#4A3B32';

function Tavern({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx="0" cy="6" rx="52" ry="12" fill="#4A3B32" opacity="0.12" />
      <rect x="-40" y="-52" width="80" height="56" fill="#F9DDBB" stroke={INK} strokeWidth="2.5" />
      <polygon points="-48,-52 48,-52 0,-84" fill="#C98F5A" stroke={INK} strokeWidth="2.5" />
      <rect x="-10" y="-30" width="20" height="34" fill="#7FB894" stroke={INK} strokeWidth="2" />
      <rect x="-32" y="-44" width="14" height="12" fill="#BFE0E8" stroke={INK} strokeWidth="2" />
      <rect x="18" y="-44" width="14" height="12" fill="#BFE0E8" stroke={INK} strokeWidth="2" />
      <text x="0" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Guild Tavern</text>
    </g>
  );
}

function Tower({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx="0" cy="6" rx="34" ry="9" fill="#4A3B32" opacity="0.12" />
      <rect x="-22" y="-78" width="44" height="82" fill="#D8CFC0" stroke={INK} strokeWidth="2.5" />
      <polygon points="-28,-78 28,-78 0,-100" fill="#8AA863" stroke={INK} strokeWidth="2.5" />
      <circle cx="0" cy="-58" r="9" fill="#BFE0E8" stroke={INK} strokeWidth="2" />
      <text x="0" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Watchtower</text>
    </g>
  );
}

function ArchTree({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx="0" cy="4" rx="40" ry="10" fill="#4A3B32" opacity="0.12" />
      <path d="M -8 4 C -10 -30, -26 -34, -44 -40 C -30 -48, -12 -44, -4 -30 C 6 -44, 26 -46, 38 -38 C 22 -32, 12 -26, 10 4 Z" fill="#6B5D4F" stroke={INK} strokeWidth="2.5" />
      <ellipse cx="-42" cy="-46" rx="20" ry="14" fill="#8AA863" stroke={INK} strokeWidth="2" />
      <ellipse cx="36" cy="-44" rx="18" ry="13" fill="#7FB894" stroke={INK} strokeWidth="2" />
      <text x="0" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Elder Arch</text>
    </g>
  );
}

function Crystal({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx="0" cy="6" rx="36" ry="9" fill="#4A3B32" opacity="0.12" />
      <polygon points="0,-70 -16,-10 0,4 16,-10" fill="#CDBCE8" stroke={INK} strokeWidth="2.5" />
      <polygon points="0,-70 -8,-30 0,-22 8,-30" fill="#E4D9F5" />
      <text x="0" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Mana Crystal</text>
    </g>
  );
}

function Forge({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx="0" cy="6" rx="40" ry="10" fill="#4A3B32" opacity="0.12" />
      <rect x="-30" y="-40" width="60" height="44" fill="#D8CFC0" stroke={INK} strokeWidth="2.5" />
      <polygon points="-30,-40 30,-40 18,-58 -18,-58" fill="#6B5D4F" stroke={INK} strokeWidth="2.5" />
      <circle cx="0" cy="-18" r="9" fill="#F2C18D" stroke={INK} strokeWidth="2" />
      <text x="0" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Forge</text>
    </g>
  );
}

function Tent({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx="0" cy="4" rx="36" ry="8" fill="#4A3B32" opacity="0.12" />
      <polygon points="-30,4 0,-38 30,4" fill="#A8DDBB" stroke={INK} strokeWidth="2.5" />
      <polygon points="-8,4 0,-14 8,4" fill="#4A3B32" />
      <text x="0" y="20" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Scout Tent</text>
    </g>
  );
}

function Campfire({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx="-10" cy="2" rx="12" ry="4" fill="#8A7B6C" />
      <ellipse cx="10" cy="2" rx="12" ry="4" fill="#8A7B6C" />
      <polygon points="-7,2 0,-16 7,2" fill="#E8845A" stroke={INK} strokeWidth="1.5" />
      <polygon points="-4,2 0,-9 4,2" fill="#F2C18D" />
    </g>
  );
}

export default function WorldObjectsLayer({ variant = 'village' }) {
  if (variant === 'none') return <div className="scene-layer objects" aria-hidden="true" />;
  return (
    <div className="scene-layer objects" aria-hidden="true">
      <svg width="1600" height="1000" viewBox="0 0 1600 1000" style={{ display: 'block', width: '100%', height: '100%' }}>
        {/* overseer terrace hint — low soft ridge, no balcony, no text wall */}
        <ellipse cx="800" cy="180" rx="420" ry="46" fill="#E8D9A8" opacity="0.55" />
        <ellipse cx="800" cy="180" rx="420" ry="46" fill="none" stroke="#D9C48F" strokeWidth="2" strokeDasharray="10 8" />
        <Tavern x={500} y={520} />
        <Tower x={240} y={360} />
        <Crystal x={1360} y={360} />
        <ArchTree x={800} y={470} s={1.15} />
        <Forge x={960} y={760} />
        <Tent x={610} y={770} />
        <ArchTree x={150} y={820} s={0.9} />
        <ArchTree x={1450} y={830} s={0.95} />
        <Campfire x={770} y={690} />
        <Campfire x={830} y={700} />
      </svg>
    </div>
  );
}
