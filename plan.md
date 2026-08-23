# DND Multi-Agent System - Plan & Roadmap

## Overview
A multi-agent system (DND) for managing a software engineering company, accessible via web at localhost. Uses pixiejs frontend, Node.js backend, and supports opencode/claudecode/codex/gemini-cli harnesses.

## ✅ Completed Items

### 1. Requirements Analysis
- **requirements.md**: Multi-agent system accessible via web (localhost), needs CNN to read text, add PDF notes, not all agents mentioned in PDF, use pixiejs for frontend, Node.js backend, support opencode/claudecode/codex/gemini-cli harnesses
- **agent_base.md**: 22+ agent roles with RPG class mappings (CEO Warlock, HR Mind Flayer, Manager Bard, Wizard, Paladin, Cleric, Sorcerer, Rogue, Ranger, Artificer, Druid, Barbarian, Blood Hunter, Vampire, Changeling/Sculptor, Death Knight/Lich, Dragonborn Warmage, Doppelgänger, Monk, Alchemist/Diviner, Inquisitor, Kobolds/Goblins)
- **pdf_transcribe.txt**: Full architecture documentation including agent hierarchies, HR system JSON format, inter-agent communication, Marshall agents, context window management, stuck process detection, frontend layout with 5-tab info panels
- **requirement_notes.pdf**: 9-page PDF (image-based, text not extractable via pdftotext)

### 2. Architecture Design - `backend.js`
- HR System JSON file-based registry in `hr-system/hr-system.json`
- Project isolation: new project → new folder under `projects/`
- Agent message files: `agent-<id>.msgs.json` per agent for inter-agent communication
- Shared state log: `shared-state.log` for fallback/audit
- Harness abstract functions with TODO comments:
  - `spawnOpencodeAgent()`, `spawnClaudeCodeAgent()`, `spawnCodexAgent()`, `spawnGeminiAgent()`
  - `findHarnessBinary()` - detects binaries in PATH
  - Generic `spawnHarnessAgent()` dispatcher
- Agent spawn decision logic: CEO for new projects, Manager for new requirements, Marshal for context exhaustion
- Marshall agent health checks (5-min cycle): obsolete agents, context exhaustion, stuck processes (10-min)
- Obsolete cleanup: HR verifies work log - if all tasks done (e.g., 10/10), agent safely removed
- Frontend API endpoints for pixiejs: `handleStartProject`, `handleSendMessage`, `handleGetAgentStatus`, `handleGetSharedLog`

### 3. Research Tasks - `user_todo.md`
16 prioritized tasks covering harness integration, HR system format, message passing, API contracts, context isolation, cleanup logic, and more.

## 📋 Remaining Items

### High Priority
1. **Harness Binary Detection**: Verify opencode, claudecode, codex, gemini-cli binaries are available or configurable
2. **Authentication Setup**: API keys for each harness (Anthropic, OpenAI, Google)
3. **Frontend Implementation**: pixiejs web application with the 5-tab layout (Chat, Agent Stats, Thought Process, Personal Context, Relationships)
4. **Agent Template System**: Create markdown templates in `agent-templates/` directory per the Agent Templates folder
5. **HR System Initialization**: Populate initial hr-system.json with CEO and HR agents (per PDF: "Initially, we will only have the CEO and HR")

### Medium Priority
6. **Progress Tracking**: Timestamp tracking per agent for 10-minute stuck process detection
7. **Context Window Monitoring**: Actual context_len vs usage tracking
8. **Handover MD Creation**: Format and logic for `<agent-id>.md` handover files
9. **Scheduled Marshall Agent**: Set up 5-minute cron/job for health checks
10. **Error Handling & Edge Cases**: Graceful degradation when harness binaries missing

### Low Priority
11. **Docker/Production Deployment**: Containerization considerations
12. **Testing Suite**: Unit tests for backend functions
13. **API Documentation**: Full REST API spec for pixiejs frontend
14. **Monitoring & Observability**: Dashboard integration beyond shared-state.log

## 🎯 Next Task to Start

**Priority: High** - Set up the initial HR system and spawn the first agents.

### Specific Actions:
1. Create `hr-system/hr-system.json` with initial agents:
   - `ceo-warlock` (CEO, main entry point)
   - `hr-mind-flayer` (HR, only agent that can spawn new agents)
   
2. Create `agent-templates/` directory structure with markdown templates for:
   - CEO Warlock
   - HR Mind Flayer
   - Manager Bard
   - Solution Architect Wizard
   
3. Test the backend by running `node -e "require('./backend.js'); console.log('Backend loaded OK')"`

4. Verify frontend can connect to backend endpoints by starting the Node.js server and testing the four API routes.

### Agent Spawn Order (per PDF architecture):
- **Step 1**: CEO Warlock (already conceptual)
- **Step 2**: HR Mind Flayer spawns (only HR can spawn new agents)
- **Step 3**: HR spawns Manager Agent for new projects
- **Step 4**: Manager requests other agents from HR as needed

---
*Plan generated from requirements.md, agent_base.md, pdf_transcribe.txt, and requirement_notes.pdf analysis.*