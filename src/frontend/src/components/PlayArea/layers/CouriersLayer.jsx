import { useEffect, useState } from 'react';
import MailSprite from '../../Agents/MailSprite.jsx';

// Layer 3 — small soft envelopes gliding sender → receiver along a short
// arc. Not full-width comets: each flight interpolates between the two
// agent positions over ~6s, then rests at the receiver until expiry.
function useFlightProgress(flightId, durationMs = 6000) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / durationMs);
      setT(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [flightId, durationMs]);
  return t;
}

function Courier({ mail, from, to, label, onOpen }) {
  const t = useFlightProgress(mail.id || mail.messageId);
  const cx = (from.x + to.x) / 2;
  const cy = Math.min(from.y, to.y) - 90;
  const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * to.x;
  const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * to.y;
  return (
    <MailSprite
      messageId={mail.messageId || mail.id}
      label={label}
      onClick={onOpen}
      style={{ left: x, top: y - 70, transform: 'translate(-50%,-50%)' }}
    />
  );
}

export default function CouriersLayer({ mails, positions, allAgents, onOpen }) {
  if (!mails?.length) return <div className="scene-layer couriers" />;
  return (
    <div className="scene-layer couriers">
      {mails.map((mail) => {
        const fromId = mail.fromAgentId || mail.senderAgentId;
        const toId = mail.toAgentId || mail.recipientAgentId;
        const from = positions[fromId] || { x: 800, y: 300 };
        const to = positions[toId] || { x: 800, y: 600 };
        const sender = allAgents[fromId]?.name || fromId || '…';
        const receiver = allAgents[toId]?.name || toId || '…';
        // Keep label tiny: first names only.
        const label = `${String(sender).split(' ')[0]} → ${String(receiver).split(' ')[0]}`;
        return (
          <Courier
            key={mail.id || mail.messageId}
            mail={mail}
            from={from}
            to={to}
            label={label}
            onOpen={() => onOpen?.(mail)}
          />
        );
      })}
    </div>
  );
}
