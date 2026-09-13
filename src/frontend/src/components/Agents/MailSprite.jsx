import { useMemo } from 'react';
import { MAIL_PALETTES } from './agentPalettes.js';

// Small soft-color envelope. Color is stable per messageId so the same
// delivery doesn't flicker between renders.
export default function MailSprite({ messageId, label, onClick, style }) {
  const color = useMemo(() => {
    let h = 0;
    const s = String(messageId || label || 'mail');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return MAIL_PALETTES[h % MAIL_PALETTES.length];
  }, [messageId, label]);

  return (
    <button className="courier-mail" style={{ background: color, ...(style || {}) }} onClick={(e) => { e.stopPropagation(); onClick?.(); }} title={label || 'Open message details'}>
      <svg width="16" height="12" viewBox="0 0 16 12" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="0" y="0" width="16" height="12" fill="#FFFDF4" stroke="#4A3B32" strokeWidth="1.5" />
        <polyline points="1,2 8,8 15,2" fill="none" stroke="#4A3B32" strokeWidth="1.5" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
