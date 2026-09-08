import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { APP_DIR, ensureBaseDirs, resolveFrontendDistDir } from './config.js';
import {
  agentRoutes,
  knowledgeRoutes,
  marshallRoutes,
  mcpRoutes,
  messageRoutes,
  modelRoutes,
  projectRoutes,
  systemRoutes
} from './routes/index.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cors());

  ensureBaseDirs();

  // Serve Frontend — built React bundle (dist/frontend from `npm run build:frontend`).
  // Falls back to the legacy src/frontend.html only when no bundle exists
  // (e.g. fresh checkout before the first frontend build).
  const frontendDist = resolveFrontendDistDir();
  if (frontendDist) {
    app.use(express.static(frontendDist));
    app.get('/', (req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
    // SPA fallback: non-API GETs without a file extension serve index.html.
    // Must be registered AFTER the API routers, so it only catches UI routes.
  } else {
    app.get('/', (req, res) => {
      res.sendFile(path.join(APP_DIR, 'src', 'frontend.html'));
    });
  }
  app.use(express.static(APP_DIR));

  // Mount domain routers (each router owns its own path prefixes)
  app.use(projectRoutes);
  app.use(modelRoutes);
  app.use(mcpRoutes);
  app.use(agentRoutes);
  app.use(messageRoutes);
  app.use(knowledgeRoutes);
  app.use(marshallRoutes);
  app.use(systemRoutes);

  // SPA fallback for the React bundle: any non-API GET without an extension
  // serves index.html so client-side routing/state stays on the same page.
  if (frontendDist) {
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
      if (req.method !== 'GET' || path.extname(req.path)) return next();
      const indexFile = path.join(frontendDist, 'index.html');
      if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
      return next();
    });
  }

  return app;
}
