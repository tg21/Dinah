import { Router } from 'express';
import { loadKnowledgeBase, runSeniorAnalystInspection } from '../services/knowledgeService.js';

const router = Router();

// Company Knowledge Base API
router.get('/api/knowledge-base', (req, res) => {
  const kb = loadKnowledgeBase();
  res.json({ knowledgeBase: kb });
});

router.post('/api/knowledge-base/query', (req, res) => {
  const { query = '' } = req.body;
  const kb = loadKnowledgeBase();
  const lower = query.toLowerCase();
  const matchingTopics = (kb.topics || []).filter(
    (t) =>
      t.title.toLowerCase().includes(lower) ||
      t.summary.toLowerCase().includes(lower) ||
      (t.tags || []).some((tag) => tag.toLowerCase().includes(lower))
  );
  res.json({ results: matchingTopics, count: matchingTopics.length });
});

router.post('/api/knowledge-base/run-analyst', (req, res) => {
  const result = runSeniorAnalystInspection();
  res.json({ success: true, result });
});

export default router;
