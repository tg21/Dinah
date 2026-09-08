import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawn } from 'child_process';
import {
  MCP_CATALOG_URL,
  USER_MCP_SERVERS_DIR,
  WORKING_DIR
} from '../config.js';
import { loadUserMcpRegistry, saveMcpRegistry } from './registry.js';

export function normaliseCatalogServer(item) {
  const server = item?.server || item;
  if (!server?.name) return null;
  const packages = server.packages || [];
  return {
    name: server.name,
    description: server.description || '',
    version: server.version || packages[0]?.version || 'latest',
    repository: server.repository || null,
    websiteUrl: server.websiteUrl || server.documentationUrl || null,
    packages: packages.map((pkg) => ({
      registryType: pkg.registryType,
      identifier: pkg.identifier,
      version: pkg.version,
      transport: pkg.transport,
      runtimeArguments: pkg.runtimeArguments || [],
      packageArguments: pkg.packageArguments || []
    }))
  };
}

export function safeMcpSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function packageNameIsSafe(value) {
  return typeof value === 'string' && /^(?:@[^/]+\/)?[a-zA-Z0-9._~-]+$/.test(value);
}

export function getInstallableNpmPackage(server) {
  return (
    server?.packages?.find(
      (pkg) => pkg.registryType === 'npm' && packageNameIsSafe(pkg.identifier)
    ) || null
  );
}

export function installedPackageDirectory(targetDir, packageName) {
  return path.join(targetDir, 'node_modules', ...packageName.split('/'));
}

export function resolveInstalledMcpCommand(targetDir, packageName) {
  const packageJsonPath = path.join(
    installedPackageDirectory(targetDir, packageName),
    'package.json'
  );
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const bin =
    typeof packageJson.bin === 'string'
      ? path.basename(packageJson.name || packageName)
      : Object.keys(packageJson.bin || {})[0];
  if (!bin)
    throw new Error(
      `Installed MCP package ${packageName} does not expose a command-line entry point`
    );
  return path.join(targetDir, 'node_modules', '.bin', bin);
}

export function discoverMcpTools(command, args, cwd) {
  return new Promise((resolve) => {
    let settled = false;
    let buffer = '';
    let errorOutput = '';
    let child;
    const finish = (tools, error = '') => {
      if (settled) return;
      settled = true;
      try {
        child?.kill('SIGTERM');
      } catch (e) {
        /* best effort */
      }
      resolve({ tools: tools || [], error: error || errorOutput.trim() || null });
    };
    try {
      child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
      const timer = setTimeout(
        () => finish([], 'MCP server did not respond to tool discovery within 12 seconds'),
        12000
      );
      const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);
            if (message.id === 1) {
              send({ jsonrpc: '2.0', method: 'notifications/initialized' });
              send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
            } else if (message.id === 2) {
              clearTimeout(timer);
              finish(
                (message.result?.tools || []).map((tool) => ({
                  name: tool.name,
                  description: tool.description || ''
                }))
              );
            }
          } catch (e) {
            /* ignore startup/log lines */
          }
        }
      });
      child.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString();
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        finish([], error.message);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        if (code !== 0)
          finish([], errorOutput || `MCP server exited before tool discovery (code ${code})`);
      });
      send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'dnd-orchestrator', version: '1.0.0' }
        }
      });
    } catch (e) {
      finish([]);
    }
  });
}

export async function searchMcpCatalog(query) {
  const url = new URL('/v0.1/servers', MCP_CATALOG_URL);
  url.searchParams.set('version', 'latest');
  url.searchParams.set('limit', '30');
  if (query) url.searchParams.set('search', query.slice(0, 120));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MCP registry returned HTTP ${response.status}`);
  const data = await response.json();
  return (data.servers || [])
    .map(normaliseCatalogServer)
    .filter((server) => server && getInstallableNpmPackage(server));
}

export async function installMcpFromCatalog(serverName, requestedVersion = 'latest') {
  if (typeof serverName !== 'string' || serverName.length < 1 || serverName.length > 200) {
    throw new Error('A valid MCP server name is required');
  }
  const detailUrl = new URL(
    `/v0.1/servers/${encodeURIComponent(serverName)}/versions/${encodeURIComponent(requestedVersion)}`,
    MCP_CATALOG_URL
  );
  const response = await fetch(detailUrl);
  if (!response.ok) throw new Error(`MCP server metadata returned HTTP ${response.status}`);
  const detail = normaliseCatalogServer(await response.json());
  const pkg = getInstallableNpmPackage(detail);
  if (!pkg) throw new Error('This MCP does not publish an installable npm package');

  const version = pkg.version || detail.version;
  const packageSpec =
    version && version !== 'latest' ? `${pkg.identifier}@${version}` : pkg.identifier;
  const id = safeMcpSlug(serverName);
  const targetDir = path.join(USER_MCP_SERVERS_DIR, id);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  try {
    execFileSync('npm', ['install', '--prefix', targetDir, '--no-audit', '--no-fund', packageSpec], {
      cwd: WORKING_DIR,
      encoding: 'utf-8',
      timeout: 180000,
      stdio: 'pipe'
    });
  } catch (error) {
    throw new Error(`npm install failed: ${(error.stderr || error.message).toString().slice(0, 500)}`);
  }

  const existing = loadUserMcpRegistry().filter((item) => item.id !== id);
  const command = resolveInstalledMcpCommand(targetDir, pkg.identifier);
  const args = [...(pkg.packageArguments || [])];
  const discovery = await discoverMcpTools(command, args, targetDir);
  const installed = {
    id,
    name: detail.name,
    description: detail.description,
    version,
    source: 'official-mcp-registry',
    serverName,
    package: pkg.identifier,
    repository: detail.repository,
    websiteUrl: detail.websiteUrl,
    command,
    args,
    env: {},
    tools: discovery.tools,
    discoveryError: discovery.error,
    installedAt: new Date().toISOString()
  };
  saveMcpRegistry([...existing, installed]);
  return installed;
}
