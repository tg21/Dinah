import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveAgentMcps, DEFAULT_WORKER_TOOLS } from './permissions.js';
import { issueOrchestrationToken, revokeOrchestrationToken } from '../services/orchestrationAuth.js';
import { PORT, TOOL_DIR } from '../config.js';
import { loadAgentDefinition } from '../services/agentDefinitions.js';

function orchestrationTools(agent) {
  const definition = loadAgentDefinition(agent.role);
  const templateTools = [...new Set([
    ...(definition?.coordination?.requiredTools || []),
    ...(definition?.coordination?.managerTools || [])
  ])];
  // Unknown roles have no template: fall back to baseline worker tools so
  // ad-hoc specialists still get get_project_status/update_progress/etc.
  // (read-all + write-own; no manager-only tools).
  const base = templateTools.length ? templateTools : [...DEFAULT_WORKER_TOOLS];
  return [...new Set([
    ...base,
    // Every invoked agent needs the delivery protocol to consume a wake-up.
    'list_inbox', 'claim_message', 'acknowledge_message', 'complete_message',
    'fail_message', 'release_message', 'get_message_status',
    // Any agent may ask or inform the user (MCQ options or free text).
    'ask_user', 'inform_user',
    ...(agent.role?.includes('ceo') ? ['create_project'] : []),
  ])];
}

function resolveMcpInvocation(mcp) {
  if (mcp.id !== 'dinah-orchestration') return mcp;
  const args = [...(mcp.args || [])];
  if (args[0] && !path.isAbsolute(args[0])) {
    args[0] = path.resolve(TOOL_DIR, args[0]);
  }
  const venvCandidates = [
    process.env.DINAH_MCP_PYTHON,
    path.join(TOOL_DIR, '.venv', 'dinah-orchestration', 'bin', 'python'),
    path.join(TOOL_DIR, '..', '.venv', 'dinah-orchestration', 'bin', 'python')
  ].filter(Boolean);
  const python = venvCandidates.find((candidate) => fs.existsSync(candidate));
  return { ...mcp, command: python || mcp.command, args };
}

export function createMcpInvocationConfig(agent, agentId, projectId) {
  const mcps = resolveAgentMcps({
    ...agent,
    mcp: {
      ...(agent.mcp || {}),
      'dinah-orchestration': { enabled: true, allowedTools: orchestrationTools(agent) }
    }
  }).map(resolveMcpInvocation);
  const orchestrationToken = issueOrchestrationToken(agentId, projectId);
  const orchestrationEnv = {
    DND_BACKEND_URL: `http://127.0.0.1:${PORT}`,
    DND_AGENT_ID: agentId,
    DND_PROJECT_ID: projectId,
    DND_MCP_TOKEN: orchestrationToken
  };
  const config = {
    version: 1,
    agentId,
    projectId,
    servers: Object.fromEntries(
      mcps.map((mcp) => [
        mcp.id,
        {
          command: mcp.command,
          args: mcp.args || [],
          env: {
            ...(mcp.env || {}),
            ...(mcp.id === 'dinah-orchestration'
              ? orchestrationEnv
              : {})
          },
          allowedTools: mcp.allowedTools
        }
      ])
    )
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-agent-mcp-'));
  const file = path.join(dir, 'mcp.json');
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  // OpenCode does not consume Dinah's internal manifest format. Give it a
  // native temporary config and pass it through OPENCODE_CONFIG in the
  // OpenCode adapter. Other harnesses continue using `file` above.
  const opencodeConfig = {
    mcp: Object.fromEntries(
      mcps.map((mcp) => [
        mcp.id,
        {
          type: 'local',
          command: [mcp.command, ...(mcp.args || [])],
          environment: {
            ...(mcp.env || {}),
            ...(mcp.id === 'dinah-orchestration' ? orchestrationEnv : {})
          },
          enabled: true
        }
      ])
    )
  };
  const opencodeFile = path.join(dir, 'opencode.json');
  fs.writeFileSync(opencodeFile, JSON.stringify(opencodeConfig, null, 2));
  // Claude Code consumes `--mcp-config` as { mcpServers: { name: { command,
  // args, env } } }. The internal manifest above is not that format, so give
  // it a native file too (previously the internal manifest was passed, which
  // claude could not parse).
  const claudeConfig = {
    mcpServers: Object.fromEntries(
      mcps.map((mcp) => [
        mcp.id,
        {
          command: mcp.command,
          args: mcp.args || [],
          env: {
            ...(mcp.env || {}),
            ...(mcp.id === 'dinah-orchestration' ? orchestrationEnv : {})
          }
        }
      ])
    )
  };
  const claudeFile = path.join(dir, 'claude.json');
  fs.writeFileSync(claudeFile, JSON.stringify(claudeConfig, null, 2));
  // GitHub Copilot CLI consumes `--additional-mcp-config` as { mcpServers:
  // { name: { type: 'local', command, args, tools, env } } } (verified via
  // `copilot mcp add --json` 2026-09-12). Tool scoping stays server-side via
  // the per-agent token, so expose all tools here like the OpenCode config.
  const copilotConfig = {
    mcpServers: Object.fromEntries(
      mcps.map((mcp) => [
        mcp.id,
        {
          type: 'local',
          command: mcp.command,
          args: mcp.args || [],
          tools: ['*'],
          env: {
            ...(mcp.env || {}),
            ...(mcp.id === 'dinah-orchestration' ? orchestrationEnv : {})
          }
        }
      ])
    )
  };
  const copilotFile = path.join(dir, 'copilot.json');
  fs.writeFileSync(copilotFile, JSON.stringify(copilotConfig, null, 2));
  return { file, opencodeFile, claudeFile, copilotFile, dir, mcps, orchestrationToken };
}

export function cleanupMcpInvocation(invocation) {
  if (invocation?.orchestrationToken) revokeOrchestrationToken(invocation.orchestrationToken);
}

export function mcpPromptContext(agent, invocation) {
  const mcps = resolveAgentMcps({
    ...agent,
    mcp: {
      ...(agent.mcp || {}),
      'dinah-orchestration': { enabled: true, allowedTools: orchestrationTools(agent) }
    }
  });
  if (!mcps.length) return '';
  const tools = mcps.flatMap((mcp) =>
    (mcp.allowedTools || []).map((tool) => `${mcp.id}.${tool}`)
  );
  return `\n\nAvailable MCP tools for this invocation: ${tools.join(', ')}. Use them as the authoritative coordination channel: publish progress after meaningful work, report blockers immediately, request help when blocked, and check project status before planning. To reach the user: ask_user pauses for a decision (options=[] free text, options=[...] multiple choice; pass a stable questionId when asking several questions so each reply is matched); inform_user sends a chat-only notice without pausing. Use only enabled tools. The harness has configured these tools; do not inspect or read MCP configuration files.`;
}
