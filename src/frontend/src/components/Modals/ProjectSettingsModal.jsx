import { useState } from 'react';
import Modal, { Field } from './Modal.jsx';
import { useApp } from '../../store/AppContext.jsx';
import { api } from '../../api/client.js';
import { BIOME_META } from '../PlayArea/layers/biomes.js';

export default function ProjectSettingsModal() {
  const { currentProjectId, projectConfigs, biomes, setActiveModal, loadProjects, loadAgents } = useApp();
  const cfg = projectConfigs[currentProjectId] || {};
  const [pathVal, setPathVal] = useState(cfg.path || '');
  const [budget, setBudget] = useState(cfg.budgetUsd || 50);
  const [tokens, setTokens] = useState(cfg.maxTokens || 1000000);
  const [biome, setBiome] = useState(cfg.biome || 'oasis');
  const biomeOptions = biomes.length ? biomes : BIOME_META.map((b) => b.id);

  async function save() {
    await api.saveProjectConfig({
      projectId: currentProjectId,
      customPath: pathVal.trim() || null,
      budgetUsd: Number(budget),
      maxTokens: Number(tokens),
      biome
    });
    setActiveModal(null);
    await loadProjects();
    await loadAgents();
  }

  return (
    <Modal
      title="Project Workspace & Budget Settings"
      icon="fa-folder-gear"
      onClose={() => setActiveModal(null)}
      footer={
        <>
          <button className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save Settings</button>
        </>
      }
    >
      <Field label="Active Project">
        <input type="text" value={currentProjectId} readOnly />
      </Field>
      <Field label="Workspace Directory Path (Root Folder)">
        <input type="text" placeholder="/path/to/project" value={pathVal} onChange={(e) => setPathVal(e.target.value)} />
        <small style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          Backend and harness CLI will execute commands within this directory.
        </small>
      </Field>
      <Field label="Project Budget ($ USD)">
        <input type="number" step={5} min={5} max={1000} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </Field>
      <Field label="Max Token Allowance">
        <input type="number" step={100000} min={100000} value={tokens} onChange={(e) => setTokens(e.target.value)} />
      </Field>
      <Field label="Meadow Biome (project backdrop)">
        <select value={biome} onChange={(e) => setBiome(e.target.value)}>
          {biomeOptions.map((id) => {
            const meta = BIOME_META.find((b) => b.id === id);
            return (
              <option key={id} value={id}>
                {meta ? `${meta.label} — ${meta.blurb}` : id}
              </option>
            );
          })}
        </select>
      </Field>
    </Modal>
  );
}
