// Layer 1 — D&D artefacts / buildings as soft SVG. Always z-index below
// agents (CSS .scene-layer.objects z1 vs .agents z10) so sprites are never
// obscured. Pointer-events none; purely decorative.
//
// Each object is anchored by FRACTIONS of the container and drawn at a
// fixed pixel size (zero-size SVG + overflow visible), so a resize only
// re-positions objects — shapes never squash or crop. Which pieces appear
// (and how many) comes from biomes.js OBJECT_SETS per project biome.
import { objectsFor } from './biomes.js';

const INK = '#4A3B32';

const PARTS = {
  Tavern() {
    return (
      <g>
        <ellipse cx="0" cy="6" rx="52" ry="12" fill="#4A3B32" opacity="0.12" />
        <rect x="-40" y="-52" width="80" height="56" fill="#F9DDBB" stroke={INK} strokeWidth="2.5" />
        <polygon points="-48,-52 48,-52 0,-84" fill="#C98F5A" stroke={INK} strokeWidth="2.5" />
        <rect x="-10" y="-30" width="20" height="34" fill="#7FB894" stroke={INK} strokeWidth="2" />
        <rect x="-32" y="-44" width="14" height="12" fill="#BFE0E8" stroke={INK} strokeWidth="2" />
        <rect x="18" y="-44" width="14" height="12" fill="#BFE0E8" stroke={INK} strokeWidth="2" />
        <text x="0" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Guild Tavern</text>
      </g>
    );
  },
  Tower() {
    return (
      <g>
        <ellipse cx="0" cy="6" rx="34" ry="9" fill="#4A3B32" opacity="0.12" />
        <rect x="-22" y="-78" width="44" height="82" fill="#D8CFC0" stroke={INK} strokeWidth="2.5" />
        <polygon points="-28,-78 28,-78 0,-100" fill="#8AA863" stroke={INK} strokeWidth="2.5" />
        <circle cx="0" cy="-58" r="9" fill="#BFE0E8" stroke={INK} strokeWidth="2" />
        <text x="0" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Watchtower</text>
      </g>
    );
  },
  ArchTree({ s = 1 }) {
    return (
      <g transform={`scale(${s})`}>
        <ellipse cx="0" cy="4" rx="40" ry="10" fill="#4A3B32" opacity="0.12" />
        <path d="M -8 4 C -10 -30, -26 -34, -44 -40 C -30 -48, -12 -44, -4 -30 C 6 -44, 26 -46, 38 -38 C 22 -32, 12 -26, 10 4 Z" fill="#6B5D4F" stroke={INK} strokeWidth="2.5" />
        <ellipse cx="-42" cy="-46" rx="20" ry="14" fill="#8AA863" stroke={INK} strokeWidth="2" />
        <ellipse cx="36" cy="-44" rx="18" ry="13" fill="#7FB894" stroke={INK} strokeWidth="2" />
        <text x="0" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Elder Arch</text>
      </g>
    );
  },
  Crystal() {
    return (
      <g>
        <ellipse cx="0" cy="6" rx="36" ry="9" fill="#4A3B32" opacity="0.12" />
        <polygon points="0,-70 -16,-10 0,4 16,-10" fill="#CDBCE8" stroke={INK} strokeWidth="2.5" />
        <polygon points="0,-70 -8,-30 0,-22 8,-30" fill="#E4D9F5" />
        <text x="0" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Mana Crystal</text>
      </g>
    );
  },
  Forge() {
    return (
      <g>
        <ellipse cx="0" cy="6" rx="40" ry="10" fill="#4A3B32" opacity="0.12" />
        <rect x="-30" y="-40" width="60" height="44" fill="#D8CFC0" stroke={INK} strokeWidth="2.5" />
        <polygon points="-30,-40 30,-40 18,-58 -18,-58" fill="#6B5D4F" stroke={INK} strokeWidth="2.5" />
        <circle cx="0" cy="-18" r="9" fill="#F2C18D" stroke={INK} strokeWidth="2" />
        <text x="0" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Forge</text>
      </g>
    );
  },
  Tent() {
    return (
      <g>
        <ellipse cx="0" cy="4" rx="36" ry="8" fill="#4A3B32" opacity="0.12" />
        <polygon points="-30,4 0,-38 30,4" fill="#A8DDBB" stroke={INK} strokeWidth="2.5" />
        <polygon points="-8,4 0,-14 8,4" fill="#4A3B32" />
        <text x="0" y="20" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Scout Tent</text>
      </g>
    );
  },
  Campfire() {
    return (
      <g>
        <ellipse cx="-10" cy="2" rx="12" ry="4" fill="#8A7B6C" />
        <ellipse cx="10" cy="2" rx="12" ry="4" fill="#8A7B6C" />
        <polygon points="-7,2 0,-16 7,2" fill="#E8845A" stroke={INK} strokeWidth="1.5" />
        <polygon points="-4,2 0,-9 4,2" fill="#F2C18D" />
      </g>
    );
  },
  FrostPine() {
    return (
      <g>
        <ellipse cx="0" cy="4" rx="30" ry="8" fill="#4A3B32" opacity="0.12" />
        <rect x="-4" y="-8" width="8" height="12" fill="#6B5D4F" stroke={INK} strokeWidth="1.5" />
        <polygon points="0,-64 -26,-14 26,-14" fill="#6E9B8E" stroke={INK} strokeWidth="2" />
        <polygon points="0,-64 -12,-40 12,-40" fill="#FFFFFF" opacity="0.9" />
        <polygon points="0,-46 -32,2 32,2" fill="#7FAEA0" stroke={INK} strokeWidth="2" />
        <polygon points="0,-46 -14,-22 14,-22" fill="#FFFFFF" opacity="0.9" />
        <text x="0" y="20" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Frost Pine</text>
      </g>
    );
  },
  LanternPost() {
    return (
      <g>
        <ellipse cx="0" cy="4" rx="16" ry="5" fill="#4A3B32" opacity="0.12" />
        <rect x="-2" y="-52" width="4" height="56" fill="#6B5D4F" stroke={INK} strokeWidth="1.5" />
        <rect x="-2" y="-56" width="18" height="4" fill="#6B5D4F" stroke={INK} strokeWidth="1.5" />
        <circle cx="8" cy="-40" r="12" fill="#F2C879" opacity="0.3" />
        <rect x="2" y="-48" width="12" height="16" fill="#F2C879" stroke={INK} strokeWidth="2" />
        <rect x="2" y="-52" width="12" height="4" fill={INK} />
        <text x="0" y="20" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>Lantern</text>
      </g>
    );
  }
};

export const WORLD_PARTS = Object.keys(PARTS);

export default function WorldObjectsLayer({ biome = 'oasis', variant, width, height }) {
  if (variant === 'none') return <div className="scene-layer objects" aria-hidden="true" />;
  const objects = objectsFor(variant || biome);
  const w = width || 1600;
  const h = height || 1000;
  return (
    <div className="scene-layer objects" aria-hidden="true">
      {/* overseer terrace hint — % geometry, soft ridge stretches harmlessly */}
      <div
        style={{
          position: 'absolute',
          left: `${((800 - 420) / 1600) * 100}%`,
          top: `${((180 - 46) / 1000) * 100}%`,
          width: `${(840 / 1600) * 100}%`,
          height: `${(92 / 1000) * 100}%`
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 840 92" preserveAspectRatio="none">
          <ellipse cx="420" cy="46" rx="420" ry="46" fill="#E8D9A8" opacity="0.55" />
          <ellipse cx="420" cy="46" rx="420" ry="46" fill="none" stroke="#D9C48F" strokeWidth="4" strokeDasharray="10 8" />
        </svg>
      </div>
      {objects.map(({ p, fx, fy, s }, i) => {
        const Part = PARTS[p];
        if (!Part) return null;
        return (
          <div
            key={`${p}-${i}`}
            style={{ position: 'absolute', left: fx * w, top: fy * h }}
          >
            <svg width="0" height="0" style={{ overflow: 'visible' }} aria-hidden="true">
              <g transform={s && s !== 1 ? `scale(${s})` : undefined}>
                <Part />
              </g>
            </svg>
          </div>
        );
      })}
    </div>
  );
}
