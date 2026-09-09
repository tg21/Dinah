import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../../store/AppContext.jsx';
import { api } from '../../api/client.js';
import { escapeHtml, formatTokens } from '../../utils/format.js';

export default function MarshallAuditModal() {
  const { setActiveModal, loadAgents } = useApp();
  const [queue, setQueue] = useState([]);

  async function load() {
    const data = await api.getMarshallAudit();
    setQueue(data.audit?.priorityQueue || []);
  }

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAudit() {
    await api.runMarshall();
    await load();
    await loadAgents();
  }

  return (
    <Modal
      title="Marshall Sentinel — Context Window Priority Audit"
      icon="fa-shield-halved"
      wide
      onClose={() => setActiveModal(null)}
      footer={
        <>
          <button className="btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
          <button className="btn-primary" onClick={runAudit}>
            <i className="fa-solid fa-bolt" /> Run Audit Now
          </button>
        </>
      }
    >
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        The Marshall Sentinel scans agents every 5 minutes and ranks active specialists by context
        consumption. Any agent nearing &gt;90% context triggers automated handover synthesis.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
        {!queue.length && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No active agents registered.</div>
        )}
        {queue.map((item, idx) => {
          const color =
            item.percentUsed >= 90 ? 'var(--accent)' : item.percentUsed >= 50 ? 'var(--gold)' : 'var(--green)';
          return (
            <div
              key={idx}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                  #{idx + 1} {escapeHtml(item.name)}{' '}
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>({item.project})</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {formatTokens(item.context_used)} / {formatTokens(item.context_len)} tokens
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color }}>{item.percentUsed}% Used</div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
