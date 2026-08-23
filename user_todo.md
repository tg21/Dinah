# DND System - Research & Integration Task List

## Status: All Core Tasks Completed ✅

### 1. Opencode Harness Integration
- [x] Research opencode CLI subprocess invocation pattern (`opencode run --dir <project> "<prompt>"`)
- [x] Implemented `spawnOpencodeAgent(projectId, prompt, agentId)` with live CLI invocation & fallback

### 2. Claudecode Harness Integration
- [x] Implemented `spawnClaudeCodeAgent(projectId, prompt, agentId)`

### 3. Codex Harness Integration
- [x] Implemented `spawnCodexAgent(projectId, prompt, agentId)`

### 4. Gemini CLI Harness Integration
- [x] Implemented `spawnGeminiAgent(projectId, prompt, agentId)`

### 5. HR System JSON File Format
- [x] Defined schema in `hr-system/hr-system.json`
- [x] Enforced HR Mind Flayer as sole agent spawner

### 6. Agent Message JSON Files
- [x] Defined format: `{ messages: [{ from, role, project, request, path, timestamp }] }`
- [x] Maintained in `hr-system/agent-<id>.msgs.json`

### 7. Shared Channel / State Log
- [x] Append-only audit trail in `shared-state/shared-state.log`

### 8. Frontend-Backend API Contract
- [x] `POST /handleStartProject`
- [x] `POST /handleSendMessage`
- [x] `POST /handleGetAgentStatus`
- [x] `POST /handleGetSharedLog`
- [x] `POST /api/agents/spawn`
- [x] `GET /api/projects`
- [x] `GET /api/agents`
- [x] `GET /api/relationships`
- [x] `POST /api/marshall/run`

### 9. Context Isolation - Project Folders
- [x] Project folders isolated under `projects/<projectId>/`

### 10. Obsolete Agent Cleanup Logic
- [x] Marshall & HR verification flow implemented in `verifyAndCleanupObsoleteAgents()`

### 11. Marshall Agent - Health Checks
- [x] 5-minute interval check implemented:
  - Obsolete agent cleanup
  - Context window exhaustion check
  - Stuck process detection (>10 min idle)

### 12. Agent Spawn Decision Logic
- [x] New project initiated by CEO
- [x] Manager Bard coordinates project requirements
- [x] HR Mind Flayer spawns requested agent from markdown template

### 13. PixiJS Frontend Implementation
- [x] Infinite canvas with pan, zoom, grid, and animated procedural D&D agent tokens
- [x] 5-Tab Baldur's Gate 3 / D&D Drawer (Chat, RPG Stats with D20 Roller, Thoughts, Context, Network)