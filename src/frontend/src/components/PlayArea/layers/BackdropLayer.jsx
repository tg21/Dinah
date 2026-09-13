import { backdropFor, biomeLabel } from './biomes.js';

// Layer 0 — soft adventure-map backdrop. Pure SVG, no logic.
// Sized 100%x100% with a stretched aspect: washes are organic blobs, so
// the backdrop exactly fills any container on every resize with no crop.
// The `biome` prop (from the project record) selects the palette + water
// feature; unknown ids fall back to oasis.
function WaterFeature({ water }) {
  const cx = 1240;
  const cy = 730;
  switch (water.kind) {
    case 'frozen':
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx="120" ry="62" fill={water.base} />
          <ellipse cx={cx} cy={cy} rx="120" ry="62" fill="none" stroke={water.ring} strokeWidth="3" />
          <ellipse cx={cx} cy={cy} rx="70" ry="34" fill={water.hi} />
          <polyline
            points={`${cx - 70},${cy - 10} ${cx - 20},${cy + 5} ${cx + 15},${cy - 8} ${cx + 60},${cy + 10}`}
            fill="none" stroke={water.crack} strokeWidth="2.5"
          />
          <polyline
            points={`${cx - 30},${cy - 30} ${cx - 10},${cy - 5} ${cx - 25},${cy + 25}`}
            fill="none" stroke={water.crack} strokeWidth="2"
          />
        </g>
      );
    case 'fountain':
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx="120" ry="62" fill={water.base} />
          <ellipse cx={cx} cy={cy} rx="120" ry="62" fill="none" stroke={water.ring} strokeWidth="5" />
          <ellipse cx={cx} cy={cy} rx="70" ry="34" fill={water.hi} />
          <rect x={cx - 8} y={cy - 52} width="16" height="56" fill={water.ring} opacity="0.85" />
          <ellipse cx={cx} cy={cy - 56} rx="26" ry="8" fill="none" stroke={water.spout} strokeWidth="2.5" />
          <ellipse cx={cx} cy={cy - 48} rx="16" ry="5" fill="none" stroke={water.spout} strokeWidth="2" />
        </g>
      );
    case 'lava':
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx="120" ry="62" fill={water.ring} />
          <ellipse cx={cx} cy={cy} rx="104" ry="52" fill={water.base} />
          <ellipse cx={cx - 20} cy={cy - 8} rx="52" ry="24" fill={water.hi} opacity="0.85" />
          <circle cx={cx + 40} cy={cy + 12} r="6" fill={water.hi} />
          <circle cx={cx + 62} cy={cy - 6} r="4" fill={water.hi} />
        </g>
      );
    case 'crystal':
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx="120" ry="62" fill={water.base} />
          <ellipse cx={cx} cy={cy} rx="120" ry="62" fill="none" stroke={water.ring} strokeWidth="3" />
          <ellipse cx={cx} cy={cy} rx="70" ry="34" fill={water.hi} />
          {[
            [cx - 40, cy - 12],
            [cx + 10, cy + 14],
            [cx + 55, cy - 18]
          ].map(([x, y], i) => (
            <g key={i} stroke={water.spark} strokeWidth="2.5">
              <line x1={x - 7} y1={y} x2={x + 7} y2={y} />
              <line x1={x} y1={y - 7} x2={x} y2={y + 7} />
            </g>
          ))}
        </g>
      );
    case 'pond':
    default:
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx="120" ry="62" fill={water.base} />
          <ellipse cx={cx} cy={cy} rx="120" ry="62" fill="none" stroke={water.ring} strokeWidth="3" />
          <ellipse cx={cx} cy={cy} rx="70" ry="34" fill={water.hi} />
        </g>
      );
  }
}

function Snowfall() {
  const flakes = Array.from({ length: 22 }).map((_, i) => ({
    left: (i * 47) % 100,
    delay: -((i * 1.7) % 12),
    duration: 9 + ((i * 2.3) % 7),
    size: 3 + ((i * 1.3) % 4)
  }));
  return (
    <div className="snow-layer" aria-hidden="true">
      {flakes.map((f, i) => (
        <span
          key={i}
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            animationDelay: `${f.delay}s`,
            animationDuration: `${f.duration}s`
          }}
        />
      ))}
    </div>
  );
}

export default function BackdropLayer({ biome = 'oasis' }) {
  const b = backdropFor(biome);
  return (
    <div className="scene-layer backdrop" aria-hidden="true" data-biome={biome} title={biomeLabel(biome)}>
      <svg width="100%" height="100%" viewBox="0 0 1600 1000" preserveAspectRatio="none" style={{ display: 'block' }}>
        <rect width="1600" height="1000" fill={b.sky} />
        {b.washes.map((w, i) => (
          <ellipse key={i} cx={w.cx} cy={w.cy} rx={w.rx} ry={w.ry} fill={w.fill} opacity={w.opacity} />
        ))}
        {b.hills.map((h, i) => (
          <ellipse key={i} cx={h.cx} cy={h.cy} rx={h.rx} ry={h.ry} fill={h.fill} />
        ))}
        {/* meadow path */}
        <path d="M -20 560 C 300 500, 550 620, 820 560 S 1300 480, 1620 560 L 1620 640 C 1300 560, 1050 660, 800 640 S 300 640, -20 640 Z" fill={b.path} opacity="0.8" />
        <path d="M -20 585 C 300 530, 560 640, 820 585 S 1300 510, 1620 585" fill="none" stroke={b.pathDash} strokeWidth="3" strokeDasharray="14 12" opacity="0.9" />
        <WaterFeature water={b.water} />
        {/* clouds */}
        <g fill={b.clouds} opacity="0.9">
          <ellipse cx="300" cy="140" rx="70" ry="24" />
          <ellipse cx="820" cy="100" rx="90" ry="26" />
          <ellipse cx="1350" cy="150" rx="80" ry="24" />
        </g>
        {/* ground sprinkles: wildflowers / pebbles / embers / fireflies */}
        <g fill={b.flora[0]} opacity="0.5">
          {Array.from({ length: 24 }).map((_, i) => (
            <circle key={i} cx={60 + ((i * 167) % 1480)} cy={700 + ((i * 89) % 240)} r="3" />
          ))}
        </g>
        <g fill={b.flora[1]} opacity="0.5">
          {Array.from({ length: 24 }).map((_, i) => (
            <circle key={i} cx={90 + ((i * 211) % 1440)} cy={120 + ((i * 131) % 380)} r="2.5" />
          ))}
        </g>
      </svg>
      {b.snow && <Snowfall />}
    </div>
  );
}
