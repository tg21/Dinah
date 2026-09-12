// Layer 0 — soft adventure-map backdrop (Image 1 feel). Pure SVG, no logic.
// Sized 100%x100% with a stretched aspect: washes are organic blobs, so
// the backdrop exactly fills any container on every resize with no crop.
export default function BackdropLayer() {
  return (
    <div className="scene-layer backdrop" aria-hidden="true">
      <svg width="100%" height="100%" viewBox="0 0 1600 1000" preserveAspectRatio="none" style={{ display: 'block' }}>
        <rect width="1600" height="1000" fill="#FFF8DC" />
        {/* soft peach wash left + mint wash bottom-right */}
        <ellipse cx="150" cy="620" rx="150" ry="330" fill="#F2C18D" opacity="0.45" />
        <ellipse cx="240" cy="300" rx="90" ry="130" fill="#F9DDBB" opacity="0.7" />
        <ellipse cx="1180" cy="800" rx="420" ry="220" fill="#A8DDBB" opacity="0.5" />
        <ellipse cx="900" cy="880" rx="330" ry="120" fill="#F2C18D" opacity="0.35" />
        <ellipse cx="1250" cy="250" rx="200" ry="110" fill="#F9DDBB" opacity="0.55" />
        {/* distant soft hills */}
        <ellipse cx="400" cy="1010" rx="550" ry="190" fill="#D6F0DE" />
        <ellipse cx="1200" cy="1020" rx="600" ry="210" fill="#C9E8D2" />
        {/* meadow path */}
        <path d="M -20 560 C 300 500, 550 620, 820 560 S 1300 480, 1620 560 L 1620 640 C 1300 560, 1050 660, 800 640 S 300 640, -20 640 Z" fill="#E8D9A8" opacity="0.8" />
        <path d="M -20 585 C 300 530, 560 640, 820 585 S 1300 510, 1620 585" fill="none" stroke="#D9C48F" strokeWidth="3" strokeDasharray="14 12" opacity="0.9" />
        {/* pond */}
        <ellipse cx="1240" cy="730" rx="120" ry="62" fill="#BFE0E8" />
        <ellipse cx="1240" cy="730" rx="120" ry="62" fill="none" stroke="#8AB8C2" strokeWidth="3" />
        <ellipse cx="1240" cy="730" rx="70" ry="34" fill="#D8EFF2" />
        {/* clouds */}
        <g fill="#FFFDF4" opacity="0.9">
          <ellipse cx="300" cy="140" rx="70" ry="24" />
          <ellipse cx="820" cy="100" rx="90" ry="26" />
          <ellipse cx="1350" cy="150" rx="80" ry="24" />
        </g>
        {/* tiny wildflowers */}
        <g fill="#C98F5A" opacity="0.5">
          {Array.from({ length: 24 }).map((_, i) => (
            <circle key={i} cx={60 + ((i * 167) % 1480)} cy={700 + ((i * 89) % 240)} r="3" />
          ))}
        </g>
        <g fill="#7FB894" opacity="0.5">
          {Array.from({ length: 24 }).map((_, i) => (
            <circle key={i} cx={90 + ((i * 211) % 1440)} cy={120 + ((i * 131) % 380)} r="2.5" />
          ))}
        </g>
      </svg>
    </div>
  );
}
