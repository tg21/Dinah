# DND System - Harness Integration Research Tasks

## Priority: High

### 1. Opencode Harness Integration
- [ ] Research opencode CLI subprocess invocation pattern
- [ ] Determine how to pass system prompts and context
- [ ] Capture output/stream events from opencode process
- [ ] Handle exit codes and error states
- [ ] TODO: Create abstract function `spawnOpencodeAgent(prompt, cwd, model)`

### 2. Claudecode Harness Integration
- [ ] Research claudecode CLI subprocess invocation pattern
- [ ] Determine API for Anthropic model calls
- [ ] Handle streaming output and cost tracking
- [ ] [TODO: Create abstract function `spawnClaudeCodeAgent(prompt, cwd)`

### 3. Codex Harness Integration
- [ ] Research Codex CLI (openai) subprocess pattern
- [ ] Determine Responses API or compatible pattern
- [ ] Handle file operations within Codex worktree
- [ ] [TODO: Create abstract function `spawnCodexAgent(prompt, cwd)`

### 4. Gemini CLI Harness Integration
- [ ] Research Gemini CLI subprocess invocation
- [ ] Handle OAuth authentication flow
- [ ] Determine context window management
- [ ] [TODO: Create abstract function `spawnGeminiAgent(prompt, cwd)`

### 5. HR System JSON File Format
- [ ] Define exact JSON schema for agent registry
- [ ] Determine file location and path conventions
- [ ] Implement read/write with file locking
- [ ] TODO: Create `hrSystem.json` with `{agent_id, name, role, project, status, context_len}`

### 6. Agent Message JSON Files
- [ ] Define message format: {name, project, request, path}
- [ ] Determine per-agent file location (project folder)
- [ ] Implement append-only log pattern
- [ TODO: Create `agent-<id>.msgs.json` per agent]

### 7. Shared Channel / State Log
- [ ] Design shared log format and file location
- [ ] Implement concurrent write safety (mutex/flock)
- [ ] Audit trail requirements
- [TODO: Create `shared-state.log` or similar]

### 8. Frontend-Backend API Contract
- [ ] Define REST endpoints for:
  - List/start agents
  - Send messages to agents
  - Read agent state/logs
  - Project folder operations
- [TODO: Design Express/Koa route handlers]

### 9. Context Isolation - Project Folders
- [ ] Implement project folder creation on new request
- [ ] Enforce scope restrictions (CEO/HR/Staff Engineer/Solution Architect global)
- [TODO: Middleware to validate project scope]

### 10. Obsolete Agent Cleanup Logic
- [ ] Read agent work log and count completed tasks
- [ ] HR verification flow before removal
- [TODO: Implement `verifyAgentObsolete(agentId)` function]

### 11. Marshall Agent - Health Checks
- [ ] Implement 5-minute cycle for:
  - Obsolete agent detection
  - Context exhaustion check
  - Stuck process detection (10-min no progress)
- [TODO: Create scheduled job/cron job]

### 12. Agent Spawn Decision Logic
- [ ] New project → CEO decides
- [ ] New requirement → Manager decides
- [ ] Agent out of context → Marshal tells Manager/HR
- [ ] Manager asks agent to stop, create handover<agent-id>.md
- [ ] HR replaces agent and passes handover MD
- [TODO: Implement spawn decision state machine]

## Medium Priority

### 13. Opencode/ClaudeCode/Codox/Gemini CLI Binary Detection
- [ ] Check if harness binaries exist in PATH or configurable locations
- [ ] Handle missing harness gracefully
- [TODO: Create `findHarnessBinary(harnessName)` function]

### 14. Environment Variable Configuration
- [ ] API keys for each harness ( Anthropic, OpenAI, Google)
- [ ] Working directory conventions
- [TODO: Create config/env setup]

### 15. Progress Tracking for Stuck Process Detection
- [ ] Timestamp tracking per agent last activity
- [ ] 10-minute threshold logic
- [TODO: Implement `checkStuckProcesses()` function]

### 16. Context Window Exhaustion Detection
- [ ] Monitor agent context_len vs actual usage
- [ ] Notification to Manager and HR
- [TODO: Implement `checkContextExhaustion()` function]