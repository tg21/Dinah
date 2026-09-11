import { useMemo, useState } from 'react';
import Modal, { Field } from './Modal.jsx';
import { useApp } from '../../store/AppContext.jsx';
import { api } from '../../api/client.js';
import { EFFORT_LEVELS } from '../../constants/startup.js';
import { groupModelsByHarness, modelCapabilitiesLabel } from '../../utils/cost.js';
import { escapeHtml } from '../../utils/format.js';

export default function AgentEditModal() {
  const { drawerAgent, allAgents, currentAgentId, models, mcps, setActiveModal, loadAgents, loadAgentDrawer } = useApp();
  const agent = drawerAgent || allAgents[currentAgentId] || {};
  const [name, setName] = useState(agent.name || '');
  const [model, setModel] = useState(agent.model || '');
  const [effort, setEffort] = useState(agent.effortLevel || 'High');
  const [prompt, setPrompt] = useState(agent.promptOverride || '');
  const [perms, setPerms] = useState(() => ({ ...(agent.mcp || {}) }));

  const groups = useMemo(() => groupModelsByHarness(models), [models]);

  function toggleServer(id, enabled) {
    setPerms((p) => {
      const mcp = mcps.find((m) => m.id === id);
      const tools = (mcp?.tools || []).map((t) => t.name);
      const next = { ...p };
      if (enabled) {
        const prev = next[id] || {};
        const checked = new Set(prev.allowedTools || tools);
        tools.forEach((t) => checked.add(t));
        next[id] = { enabled: true, allowedTools: [...checked] };
      } else {
        next[id] = { enabled: false, allowedTools: next[id]?.allowedTools || [] };
      }
      return next;
    });
  }

  function toggleTool(id, tool, checked) {
    setPerms((p) => ({
      ...p,
      [id]: {
        enabled: true,
        allowedTools: checked
          ? [...new Set([...(p[id]?.allowedTools || []), tool])]
          : (p[id]?.allowedTools || []).filter((t) => t !== tool)
      }
    }));
  }

  async function save() {
    await api.updateAgent(currentAgentId, {
      name: name.trim(),
      model,
      effortLevel: effort,
      promptOverride: prompt.trim(),
      mcp: perms
    });
    setActiveModal(null);
    await loadAgents();
    await loadAgentDrawer(currentAgentId);
  }

  return (
    <Modal
      title="Configure Agent Capabilities"
      icon="fa-sliders"
      onClose={() => setActiveModal(null)}
      footer={
        <>
          <button className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save Changes</button>
        </>
      }
    >
      <Field label="Agent Custom Name">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Model Engine (Discovered System Harnesses)">
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {models.length === 0 && <option value="">No models detected (Simulation mode)</option>}
          {Object.entries(groups).map(([g, list]) => (
            <optgroup key={g} label={g}>
              {list.map((m) => (
                <option key={m.id} value={m.id}>{modelCapabilitiesLabel(m)}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="Effort Level">
        <select value={effort} onChange={(e) => setEffort(e.target.value)}>
          {EFFORT_LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </Field>
      <Field label="System Prompt Override">
        <textarea rows={3} placeholder="Custom instructions or behavioral guidelines..." value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      <Field label="MCP Tool Inventory">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: 8, maxHeight: 220, overflowY: 'auto' }}>
          {!mcps.length && (
            <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            No MCPs registered. Add user-managed servers through the MCP armory.
            </div>
          )}
          {mcps.map((mcp) => {
            const tools = mcp.tools || [];
            const perm = perms[mcp.id] || (mcp.id === 'dinah-orchestration'
              ? { enabled: true, allowedTools: tools.map((tool) => tool.name) }
              : {});
            const source = agent.mcp?.[mcp.id] || perms[mcp.id] ? 'persisted' : 'default';
            return (
              <div key={mcp.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!perm.enabled} onChange={(e) => toggleServer(mcp.id, e.target.checked)} />
                  <span>{escapeHtml(mcp.name || mcp.id)} <small style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({mcp.sourceType === 'shipped' ? 'included' : 'user-managed'} · {source})</small></span>
                  <small style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{escapeHtml(mcp.description || '')}{mcp.id === 'dinah-orchestration' ? ' · Always enabled at invocation' : ''}</small>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '6px 0 0 22px' }}>
                  {tools.length ? (
                    tools.map((tool) => (
                      <label key={tool.name} style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        <input
                          type="checkbox"
                          checked={perm.enabled ? (perm.allowedTools || tools.map((t) => t.name)).includes(tool.name) : false}
                          disabled={!perm.enabled}
                          onChange={(e) => toggleTool(mcp.id, tool.name, e.target.checked)}
                        />{' '}
                        {escapeHtml(tool.name)}
                      </label>
                    ))
                  ) : (
                    <small style={{ color: 'var(--text-muted)' }}>Server-level access</small>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Field>
    </Modal>
  );
}
