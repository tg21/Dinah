# DND Multi-Agent System - Plan & Roadmap

## Overview
A multi-agent system (DND) for managing a software engineering company with RPG/D&D character classes, accessible via web at `localhost:2121`. Uses a Pixi.js infinite canvas frontend, Node.js Express backend, and supports OpenCode (`/usr/bin/opencode`), Claude Code, Codex, and Gemini CLI harnesses.

## ✅ Completed Items

### 1. Requirements Consolidation
- **requirements.md**: Comprehensive specifications incorporating all architecture workflows from `pdf_transcribe.txt` and all 22+ agent archetypes from `agent_base.md`.
- **agent_base.md**: Full roster of 22+ roles mapped to D&D classes.
- **pdf_transcribe.txt**: System state, HR registry format, inter-agent messaging, Marshall agent checks, and 5-tab UI wireframe.

### 2. Agent Templates Library (`agent-templates/` & `Agent Templates/`)
- Created 23 detailed markdown templates for all agent archetypes:
  1. `ceo-warlock.md`
  2. `hr-mind-flayer.md`
  3. `manager-bard.md`
  4. `solution-architect-wizard.md`
  5. `staff-engineer-paladin.md`
  6. `backend-dev-cleric.md`
  7. `frontend-dev-sorcerer.md`
  8. `qa-engineer-rogue.md`
  9. `information-sourcer-ranger.md`
  10. `office-librarian-artificer.md`
  11. `excel-admin-druid.md`
  12. `cleaner-facilities-barbarian.md`
  13. `system-analyst-blood-hunter.md`
  14. `consultants-vampires.md`
  15. `designers-changeling-sculptor.md`
  16. `cybersecurity-death-knight-lich.md`
  17. `devops-sre-dragonborn-warmage.md`
  18. `product-manager-doppelganger.md`
  19. `scrum-master-monk.md`
  20. `data-scientist-alchemist-diviner.md`
  21. `legal-compliance-inquisitor.md`
  22. `interns-kobolds-goblins.md`
  23. `marshall-agent-system-inspector.md`

### 3. Backend Engine (`backend.js`)
- **HR System Registry**: File-based agent registry in `hr-system/hr-system.json` with sole-spawner enforcement for `hr-mind-flayer`.
- **Harness Integrations**: Live execution support for `/usr/bin/opencode` (`opencode run`) plus Claude Code, Codex, and Gemini CLI dispatchers with persona simulation fallbacks.
- **Marshall Watchdog**: 5-minute health check cycle monitoring context window limits, stuck processes (>10 min threshold), and obsolete agent cleanup.
- **REST Endpoints**:
  - `GET /` & static assets for Web UI
  - `GET /api/projects` & `POST /handleStartProject`
  - `GET /api/agents` & `POST /api/agents/spawn` (HR Spawning)
  - `POST /handleGetAgentStatus` & `POST /handleSendMessage`
  - `GET /api/relationships` & `POST /handleGetSharedLog`
  - `POST /api/marshall/run` (Manual watchdog trigger)

### 4. Pixi.js Infinite Canvas & BG3 Drawer Frontend (`frontend.html`)
- **Pixi.js 2D Infinite Canvas**: Pan, zoom, animated procedural D&D agent tokens, sinusoidal idle floating, communication links, and click-to-focus.
- **Top Navigation Bar**: Project switcher tabs, "+ New Project" modal, Harness selector (`opencode`, `claude-code`, `codex`, `gemini`), and Marshall watchdog status badge.
- **5-Tab Baldur's Gate 3 / D&D Drawer**:
  - **Tab 1: Chat**: Real-time agent chat with markdown bubbles and quick prompt chips.
  - **Tab 2: Agent Stats (BG3 Character Sheet)**: Level, Class/Subclass, HP bar, AC, D&D Ability Scores (STR, DEX, CON, INT, WIS, CHA) with modifiers, interactive **D20 Dice Roller**, Spells & Actions, Inventory.
  - **Tab 3: Thought Process**: Live streaming chain-of-thought and telemetry log.
  - **Tab 4: Personal Context**: Context window token meter (used vs limit), active workspace file tree.
  - **Tab 5: Relationships**: Active network graph and connection matrix.
- **Modals**: New Project Creator and HR Agent Spawner.

---
*Status: All core requirements implemented, verified, and operational.*