import { Router } from 'express';
import { getRoleSprites } from '../services/agentDefinitions.js';

const router = Router();

// Cosmetic-only role roster for the UI: per-role sprite silhouette blocks
// read live from agent-templates/<role>.json (`sprite: {hat,tool,ears}`).
// Template edits go live on restart with no frontend rebuild; roles without
// a usable block are omitted and the UI falls back to its default.
router.get('/api/roles', (req, res) => {
  res.json({ roles: getRoleSprites() });
});

export default router;
