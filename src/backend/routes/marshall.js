import { Router } from 'express';
import { loadMarshallAudit, runMarshallChecks } from '../services/marshallService.js';

const router = Router();

// Marshall Sentinel Endpoints
router.get('/api/marshall/audit', (req, res) => {
  const audit = loadMarshallAudit();
  res.json({ audit });
});

router.post('/api/marshall/run', (req, res) => {
  const report = runMarshallChecks();
  res.json({ success: true, report });
});

export default router;
