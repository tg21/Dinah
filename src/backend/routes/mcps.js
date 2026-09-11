import { Router } from 'express';
import { appendToSharedLog } from '../services/messageService.js';
import { installMcpFromCatalog, loadMcpRegistry, searchMcpCatalog } from '../mcp/index.js';
import { resolveEffectiveMcps } from '../mcp/permissions.js';
import { loadHrSystem } from '../services/hrService.js';

const router = Router();

router.get('/api/mcps', (req, res) => {
  const { agentId } = req.query || {};
  if (agentId) {
    const agent = loadHrSystem()[String(agentId)];
    if (!agent) return res.status(404).json({ error: `Agent ${agentId} not found` });
    return res.json({ mcps: resolveEffectiveMcps(agent), agentId });
  }
  res.json({ mcps: loadMcpRegistry() });
});

router.get('/api/mcps/search', async (req, res) => {
  try {
    const results = await searchMcpCatalog(String(req.query.q || '').trim());
    const installedIds = new Set(loadMcpRegistry().map((mcp) => mcp.serverName || mcp.id));
    res.json({ results: results.map((result) => ({ ...result, installed: installedIds.has(result.name) })) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/api/mcps/install', async (req, res) => {
  try {
    const installed = await installMcpFromCatalog(req.body?.serverName, req.body?.version || 'latest');
    appendToSharedLog(`Installed MCP [${installed.name}] version [${installed.version}] into shared registry.`);
    res.json({ success: true, mcp: installed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
