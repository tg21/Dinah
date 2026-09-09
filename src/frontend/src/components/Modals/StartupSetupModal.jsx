import { useEffect, useState } from 'react';
import Modal, { Field } from './Modal.jsx';
import { useApp } from '../../store/AppContext.jsx';
import { api } from '../../api/client.js';
import { STARTUP_TOP_LEVEL_LABELS } from '../../constants/startup.js';
import { modelCapabilitiesLabel, groupModelsByHarness } from '../../utils/cost.js';

function ModelSelect({ id, value, onChange, includeCeoChoice }) {
  const { models } = useApp();
  const groups = groupModelsByHarness(models);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {includeCeoChoice && <option value="ceo">CEO chooses from available models</option>}
      {models.length === 0 && <option value="">No models detected (Simulation mode)</option>}
      {Object.entries(groups).map(([group, list]) => (
        <optgroup key={group} label={group}>
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {modelCapabilitiesLabel(m)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function StartupSetupModal() {
  const { setActiveModal, loadAgents } = useApp();
  const [ceoModel, setCeoModel] = useState('');
  const [assignments, setAssignments] = useState({ 'hr-mind-flayer': 'ceo' });
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = {};
    for (const id of Object.keys(STARTUP_TOP_LEVEL_LABELS)) init[id] = 'ceo';
    setAssignments(init);
  }, []);

  async function submit() {
    setStatus('Manifesting your executive council…');
    setSaving(true);
    try {
      await api.saveStartupSetup({ ceoModel, topLevelAssignments: assignments });
      setActiveModal(null);
      await loadAgents();
    } catch (err) {
      setStatus(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Welcome to DND Guild"
      icon="fa-crown"
      onClose={() => {}}
      footer={
        <button className="btn-primary" onClick={submit} disabled={saving}>
          <i className="fa-solid fa-door-open" /> Enter the Guild
        </button>
      }
    >
      <div className="startup-intro">
        Choose the model that leads your guild. For the other executive agents, you can assign a
        model yourself or ask the CEO to evaluate available models and harnesses using role
        requirements and capability evidence. This setup is only shown once on this installation.
      </div>
      <div className="startup-section-title">Chief Executive Officer</div>
      <Field label="CEO Warlock — primary model">
        <ModelSelect value={ceoModel} onChange={setCeoModel} />
      </Field>
      <div className="startup-section-title">Executive Council</div>
      <div>
        {Object.entries(STARTUP_TOP_LEVEL_LABELS).map(([id, [name, description]]) => (
          <div key={id} className="startup-agent-row">
            <div className="startup-agent-label">
              {name}
              <small>{description}</small>
            </div>
            <ModelSelect
              value={assignments[id] || 'ceo'}
              includeCeoChoice
              onChange={(v) => setAssignments((a) => ({ ...a, [id]: v }))}
            />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--accent)', minHeight: 14 }}>{status}</div>
    </Modal>
  );
}
