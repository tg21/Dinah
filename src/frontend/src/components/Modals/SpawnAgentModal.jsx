import { useMemo, useState } from 'react';
import Modal, { Field } from './Modal.jsx';
import { useApp } from '../../store/AppContext.jsx';
import { api } from '../../api/client.js';
import { SPAWNABLE_ROLES } from '../../constants/roles.js';
import { EFFORT_LEVELS } from '../../constants/startup.js';
import { estimateSpawnCost, groupModelsByHarness, modelCapabilitiesLabel } from '../../utils/cost.js';

export default function SpawnAgentModal() {
  const { models, projects, currentProjectId, setActiveModal, loadAgents, selectAgent } = useApp();
  const [role, setRole] = useState(SPAWNABLE_ROLES[0][0]);
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('High');
  const [project, setProject] = useState(currentProjectId);

  const groups = useMemo(() => groupModelsByHarness(models), [models]);
  const { estTokens, estCost } = estimateSpawnCost(model, effort);
  const harnessTag = models.find((m) => m.id === model)?.source?.harness;

  async function submit() {
    const data = await api.requestSummon({ role, projectId: project, model, effortLevel: effort });
    setActiveModal(null);
    await loadAgents();
    if (data.agentId) selectAgent(data.agentId);
  }

  return (
    <Modal
      title="HR Mind Flayer — Summon Specialist"
      icon="fa-wand-magic-sparkles"
      onClose={() => setActiveModal(null)}
      footer={
        <>
          <button className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Request Summoning</button>
        </>
      }
    >
      <Field label="Select Agent Archetype">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {SPAWNABLE_ROLES.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
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
      <Field label="Reasoning Effort Level">
        <select value={effort} onChange={(e) => setEffort(e.target.value)}>
          <option value="High">High (Deep reasoning)</option>
          <option value="Medium">Medium (Balanced)</option>
          <option value="Extreme">Extreme (Maximum thinking tokens)</option>
          <option value="Low">Low (Fast &amp; budget-conscious)</option>
        </select>
      </Field>
      <Field label="Assign to Project">
        <select value={project} onChange={(e) => setProject(e.target.value)}>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </Field>
      <div className="cost-preview-box">
        <div>
          <div>Est. Task Token Budget: <strong>{estTokens.toLocaleString()} Tokens</strong></div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Est. Task Cost: <strong style={{ color: 'var(--green)' }}>${estCost} USD{harnessTag ? ` (${harnessTag})` : ''}</strong>
          </div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--gold)' }}><i className="fa-solid fa-coins" /> Budget Safe</span>
      </div>
      {/* Keep effort options discoverable even when a subset is shown above */}
      <span style={{ display: 'none' }}>{EFFORT_LEVELS.join(',')}</span>
    </Modal>
  );
}
