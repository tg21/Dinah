import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../../store/AppContext.jsx';
import { api } from '../../api/client.js';
import { escapeHtml } from '../../utils/format.js';

export default function KnowledgeBaseModal() {
  const { setActiveModal } = useApp();
  const [topics, setTopics] = useState([]);
  const [all, setAll] = useState([]);
  const [query, setQuery] = useState('');

  async function load() {
    const data = await api.getKnowledgeBase();
    const list = data.knowledgeBase?.topics || [];
    setTopics(list);
    setAll(list);
  }

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function filter(q) {
    setQuery(q);
    const lower = q.toLowerCase();
    setTopics(
      all.filter(
        (t) =>
          t.title.toLowerCase().includes(lower) ||
          t.summary.toLowerCase().includes(lower) ||
          (t.tags || []).some((tag) => tag.toLowerCase().includes(lower))
      )
    );
  }

  async function runAnalyst() {
    await api.runAnalyst();
    await load();
  }

  return (
    <Modal
      title="Company Knowledge Base (Senior Analyst)"
      icon="fa-brain"
      wide
      onClose={() => setActiveModal(null)}
      footer={<button className="btn-secondary" onClick={() => setActiveModal(null)}>Close</button>}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="Search architectural decisions, schemas, topics..."
          value={query}
          onChange={(e) => filter(e.target.value)}
          style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 8, borderRadius: 6, color: '#fff', fontSize: 12 }}
        />
        <button className="btn-primary" onClick={runAnalyst}>
          <i className="fa-solid fa-arrows-rotate" /> Run Analyst Now
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
        {topics.map((t, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cyan)' }}>{escapeHtml(t.title)}</span>
              <span style={{ fontSize: 9, background: 'rgba(0,188,212,0.15)', color: 'var(--cyan)', padding: '2px 6px', borderRadius: 4 }}>
                {escapeHtml(t.category)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 4 }}>{escapeHtml(t.summary)}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>
              <i className="fa-solid fa-feather" /> {escapeHtml(t.author)}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
