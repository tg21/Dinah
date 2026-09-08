import express from 'express';
import cors from 'cors';
import path from 'path';
import { APP_DIR, ensureBaseDirs } from './config.js';
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

  // Serve Frontend
  app.get('/', (req, res) => {
    res.sendFile(path.join(APP_DIR, 'src', 'frontend.html'));
  });
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

  return app;
}
