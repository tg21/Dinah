import { useState } from 'react';
import Modal, { Field } from './Modal.jsx';
import { useApp } from '../../store/AppContext.jsx';
import { api } from '../../api/client.js';

export default function NewProjectModal() {
  const { setActiveModal, loadProjects, loadAgents, switchProject } = useApp();
  const [id, setId] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [budget, setBudget] = useState(50);

  async function submit() {
    if (!id.trim()) return;
    await api.startProject({ projectId: id.trim(), customPath: customPath.trim() || null, budgetUsd: Number(budget) || 50 });
    setActiveModal(null);
    await loadProjects();
    await loadAgents();
    await switchProject(id.trim());
  }

  return (
    <Modal
      title="Create New Project"
      icon="fa-cube"
      onClose={() => setActiveModal(null)}
      footer={
        <>
          <button className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Create Project</button>
        </>
      }
    >
      <Field label="Project Slug (e.g. project-gamma)">
        <input type="text" placeholder="project-gamma" value={id} onChange={(e) => setId(e.target.value)} />
      </Field>
      <Field label="Custom Workspace Directory (Optional)">
        <input
          type="text"
          placeholder="/home/starborn/Code/DND/projects/project-gamma"
          value={customPath}
          onChange={(e) => setCustomPath(e.target.value)}
        />
      </Field>
      <Field label="Initial Token / USD Budget ($)">
        <input type="number" value={budget} min={5} max={500} onChange={(e) => setBudget(e.target.value)} />
      </Field>
    </Modal>
  );
}
