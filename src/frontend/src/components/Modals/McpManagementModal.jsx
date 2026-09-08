import { useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../../store/AppContext.jsx';
import { api } from '../../api/client.js';
import { escapeHtml } from '../../utils/format.js';

export default function McpManagementModal() {
  const { mcps, setMcps, allAgents, currentAgentId, setActiveModal, loadAgents, loadAgentDrawer } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('');

  async function refresh() {
    const data = await api.getMcps();
    setMcps(data.mcps || []);
  }

  async function search() {
    setStatus('Searching the official MCP Registry...');
    setResults([]);
    try {
      const data = await api.searchMcps(query);
      const installable = (data.results || []).filter((r) =>
        (r.packages || []).some((p) => p.registryType === 'npm' && p.identifier)
      );
      setStatus(`${installable.length} result${installable.length === 1 ? '' : 's'} found.`);
      setResults(installable);
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function install(serverName, version) {
    setStatus('Downloading and installing MCP package...');
    try {
      const data = await api.installMcp({ serverName, version });
      await refresh();
      await equip(data.mcp.id, true);
      setStatus(`${data.mcp.name} installed and equipped for ${allAgents[currentAgentId]?.name || 'the current agent'}.`);
      await search();
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function equip(id, enabled) {
    const agent = allAgents[currentAgentId];
    if (!agent) return;
    const permissions = { ...(agent.mcp || {}) };
    const mcp = mcps.find((m) => m.id === id);
    permissions[id] = { enabled, allowedTools: (mcp?.tools || []).map((t) => t.name) };
    const data = await api.updateAgent(currentAgentId, { mcp: permissions });
    await loadAgents();
    if (data.agent) await loadAgentDrawer(currentAgentId);
  }

  const agent = allAgents[currentAgentId] || {};

  return (
    <Modal
      title="MCP Armory & Marketplace"
      icon="fa-toolbox"
      wide
      onClose={() => setActiveModal(null)}
      footer={<button className="btn-secondary" onClick={() => setActiveModal(null)}>Close</button>}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="Search the official MCP Registry (filesystem, github, postgres...)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search();
          }}
          style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 8, borderRadius: 6, color: '#fff', fontSize: 12 }}
        />
        <button className="btn-primary" onClick={search}>
          <i className="fa-solid fa-magnifying-glass" /> Search
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', margin: '8px 0' }}>{status}</div>
      <div className="section-title" style={{ marginTop: 8 }}>
        <i className="fa-solid fa-download" /> Search Results
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 250, overflowY: 'auto' }}>
        {!results.length && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Search the official registry to discover installable MCP servers.
          </div>
        )}
        {results.map((r) => (
          <div
            key={`${r.name}@${r.version}`}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}
          >
            <div>
              <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{escapeHtml(r.name)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {escapeHtml(r.description || 'No description')} · v{escapeHtml(r.version || 'latest')}
              </div>
            </div>
            <div>
              {r.installed ? (
                <span style={{ color: 'var(--green)', fontSize: 10 }}>Installed</span>
              ) : (
                <button className="btn-primary" style={{ padding: '4px 8px', fontSize: 10 }} onClick={() => install(r.name, r.version || 'latest')}>
                  <i className="fa-solid fa-download" /> Download
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="section-title" style={{ marginTop: 12 }}>
        <i className="fa-solid fa-shield-halved" /> Shared MCPs
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 180, overflowY: 'auto' }}>
        {!mcps.length && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>No shared MCPs installed yet.</div>
        )}
        {mcps.map((mcp) => {
          const equipped = agent.mcp?.[mcp.id]?.enabled === true;
          return (
            <div
              key={mcp.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 8px' }}
            >
              <div>
                <strong style={{ color: '#fff', fontSize: 11 }}>{escapeHtml(mcp.name || mcp.id)}</strong>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {escapeHtml(mcp.description || 'Shared MCP server')} · {mcp.tools?.length || 0} tools
                  discovered{mcp.discoveryError ? ` · ${escapeHtml(mcp.discoveryError)}` : ''}
                </div>
              </div>
              <button
                className={equipped ? 'btn-secondary' : 'btn-primary'}
                style={{ padding: '4px 8px', fontSize: 10 }}
                onClick={() => equip(mcp.id, !equipped)}
              >
                {equipped ? 'Unequip' : 'Equip'}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
