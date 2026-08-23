# DND: Multi-Agent System Requirements

A multi-agent system called **DND** designed for running and managing a software engineering company with D&D / RPG-inspired autonomous agents. The system is accessible and manageable via a web interface running on `localhost`.

---

## 1. High-Level Architecture & Tech Stack

- **Frontend**: Web application built with **Pixi.js** for an interactive infinite canvas (Play Area) with animated D&D-themed agents, coupled with a 5-tab Baldur's Gate 3 / D&D-styled right drawer.
- **Backend**: **Node.js** (Express) backend managing project isolation, agent registries, message passing, health checks, and harness dispatching.
- **Harness Support**: LLM-agnostic harness integration supporting:
  - **OpenCode** (`opencode run --dir <project> "<prompt>"`)
  - **Claude Code** (`claude-code` / `claude`)
  - **Codex** (`codex`)
  - **Gemini CLI** (`gemini` / `gemini-cli`)
- **Agent Templates**: Stored in `agent-templates/` (or `Agent Templates/`) defining markdown templates for each agent archetype.

---

## 2. Core Agent Hierarchy & Lifecycle Rules

```
                      ┌──────────────────────┐
                      │     CEO Warlock      │
                      │ (Main Entry Point)   │
                      └──────────┬───────────┘
                                 │
                         Delegates / Requests
                                 │
                                 ▼
                      ┌──────────────────────┐
                      │ HR Mind Flayer       │
                      │   / Illithid         │
                      └──────────┬───────────┘
                                 │
                         Spawns / Manages
                                 │
                                 ▼
                      ┌──────────────────────┐
                      │    Manager Bard      │
                      │  (Router Agent)      │
                      └──────────┬───────────┘
                                 │
             ┌───────────────────┼───────────────────┐
             ▼                   ▼                   ▼
   ┌───────────────────┐ ┌───────────────┐ ┌───────────────────┐
   │Solution Architect │ │ Other Agents  │ │  Marshall Agent   │
   │      Wizard       │ │ (Engineers,   │ │ (System Inspector │
   │                   │ │  QA, etc.)    │ │    every 5 min)   │
   └───────────────────┘ └───────────────┘ └───────────────────┘
```

### Hierarchy Rules:
1. **CEO Warlock**: Main entry point. All new project requests go to the CEO first. CEO delegates downstream to HR.
2. **HR Mind Flayer / Illithid**:
   - **CRITICAL RULE**: ONLY HR can spawn new agents.
   - Initial State: Initially, the system only contains the CEO and HR.
   - For a new project, HR spawns a Manager Agent from `agent-templates/manager-bard.md`.
   - HR spawns any additional agents requested by the Manager.
   - HR exclusively maintains the HR Registry (`hr-system/hr-system.json`).
3. **Manager Bard**: Router agent for an active project. Receives project requirements, plans execution, requests worker agents from HR, and delegates tasks.
4. **Solution Architect Wizard**: Handles technical blueprints, system design, and architectural specifications.
5. **Worker Agents**: Specialized role-based agents executing engineering, QA, design, security, and ops tasks.
6. **Marshall Agent**: System inspector running periodic checks (every 5 minutes).

---

## 3. Complete Agent Roster (from `agent_base.md` & `pdf_transcribe.txt`)

### Core Executive & Leadership
1. **CEO — Warlock**: Bound to the Eldritch Board of Directors. Main entry point for all new company initiatives.
2. **HR — Mind Flayer / Illithid**: Extracts compliance and devours morale. Exclusively spawns and manages all agent lifecycles.
3. **Managers — Bard**: Wields *Vicious Mockery* and passive-aggressive charisma. Routes work and coordinates project agents.
4. **Product Manager — Doppelgänger**: Mirrors whoever they spoke to last—promising engineering freedom while promising sales redesigns.
5. **Scrum Master — Monk**: Maintains strict balance, rigid routines, and removes blockers through sprint rituals.

### Engineering & Architecture
6. **Solution Architect — Wizard**: Draws complex, theoretical blueprints from high towers.
7. **Staff Engineer — Paladin**: Enforces the Sacred Oath of Clean Code and code review righteousness.
8. **Backend Dev — Cleric**: Prays to fickle legacy database gods to keep connections alive.
9. **Frontend Dev — Sorcerer**: Channels pure, unpredictable visual magic and CSS spells.
10. **QA Engineer — Rogue**: Lurks in shadows to stab code in its soft spots and edge cases.
11. **DevOps / SRE — Dragonborn Warmage**: Built for heavy structural fallout, deployment explosions, and load tanking.
12. **System Analyst — Blood Hunter**: Tracks down invisible operational errors by reading system vital signs.
13. **Data Scientist — Alchemist / Diviner**: Distills raw vats of unstructured dark data into predictive executive magic potions.

### Security, Legal & Operations
14. **Cybersecurity — Death Knight / Lich**: Armored guardian perimeter, locking down exploits and unauthorized access.
15. **Legal & Compliance — Inquisitor**: Holds the absolute power of veto and contract excommunication.
16. **Information Sourcer — Ranger**: Forages internet wilderness for obscure documentation and external data.
17. **Office Librarian — Artificer**: Constructs and maintains the sacred, interconnected wiki knowledge base.
18. **Excel / Admin — Druid**: Speaks the wild, natural language of macros, formulas, and spreadsheets.
19. **Cleaner / Facilities — Barbarian**: Enters a rage to brute-force physical fixes and disk space cleanup.
20. **Designers (UI/UX) — Changeling / Sculptor**: Shape-shifters molding layouts and aesthetic vibes.
21. **Consultants — Vampires**: Drain the budget dry, demand high-level access, and vanish before consequences land.
22. **Interns — Kobolds / Goblins**: Low hit points, chaotic swarms, easily startled by the CEO, running errand tasks.
23. **Marshall Agent — System Inspector**: Periodic watchdog monitoring context, stuck tasks, and obsolete workers.

---

## 4. System State & Communication Architecture

### HR System Registry (`hr-system/hr-system.json`)
Maintained strictly by the HR agent.
```json
{
  "agent-id": {
    "name": "Agent Name",
    "role": "agent-role-slug",
    "project": "project-id | global",
    "status": "active | idle | stuck | obsolete",
    "context_len": 10000,
    "created_at": "ISO-8601 Timestamp",
    "last_activity_ms": 1700000000000,
    "stats": { ... }
  }
}
```

### Direct Inter-Agent Communication (`hr-system/agent-<id>.msgs.json`)
- Agents read the HR System to locate peers.
- Agents send direct messages to each other to pass context, artifacts, and task requests.
- Each agent maintains an append-only message log: `{ "messages": [ { "from", "project", "request", "path", "timestamp" } ] }`.

### Shared State & Audit Log (`shared-state/shared-state.log`)
- Central audit log recording major lifecycle events, CEO project creation, Marshall alerts, and handovers.

### Project Isolation (`projects/<project-id>/`)
- Each project has an isolated workspace directory.
- Global agents (`ceo-warlock`, `hr-mind-flayer`, `staff-engineer-paladin`, `wizard-solution-architect`) have global view; project-scoped agents operate within their project directory.

---

## 5. Marshall Agent & Health Check Workflows (Runs Every 5 Minutes)

1. **Obsolete Agent Cleanup**:
   - Marshall inspects agent work logs and task counts.
   - If an agent has completed all assigned tasks (e.g. 10/10 tasks finished), Marshall alerts HR.
   - HR verifies completion and safely removes the agent from the active HR registry.
2. **Context Window Management**:
   - Marshall checks context length / remaining token capacity for all running agents.
   - If an agent approaches exhaustion (e.g. context remaining < threshold), Marshall triggers a handover alert to the Manager and HR.
   - Manager instructs agent to produce a structured `handover-<agentId>.md` summary.
   - HR spawns a fresh successor agent and injects the handover document.
3. **Stuck Process Detection & Human-in-the-Loop**:
   - Marshall checks for processes with no activity for > 10 minutes or locked in endless shell tasks.
   - Marshall flags the stuck agent and notifies the Manager.
   - Manager escalates to Human-in-the-Loop via the chat interface for intervention.

---

## 6. Frontend Specifications (Pixi.js & BG3 / D&D Drawer)

### Layout Wireframe
```
+---------------------------------------------------------------------------------------+
|  [ Project 1 ]   [ Project 2 ]   [ Project 3 ]   │  Chat with Manager                 |
+--------------------------------------------------+------------------------------------+
|                                                  | [Tab 1: Chat]                      |
|                                                  | [Tab 2: Agent Stats (DnD / BG3)]   |
|               PLAY AREA (Infinite Canvas)        | [Tab 3: Thought Process]           |
|                                                  | [Tab 4: Personal Context]          |
|      [CEO]        [HR]         [Manager]         | [Tab 5: Relationships & Networks]  |
|         \          |          /                  +------------------------------------+
|          (Animated DnD-based Agents)             |                                    |
|                                                  | CHAT & TAB CONTENT DISPLAY AREA    |
|                                                  |                                    |
|                                                  |                                    |
|                                                  |                                    |
+--------------------------------------------------+------------------------------------+
|                                                  | + Type...                          |
+---------------------------------------------------------------------------------------+
```

### Components:
- **Top Navigation / Project Bar**:
  - Project switching tabs + "+ New Project" trigger.
  - Active chat focus indicator and system status.
- **Play Area (Pixi.js Infinite Canvas)**:
  - Interactive pan, zoom, and drag.
  - Animated procedural D&D agent tokens with archetype icons, glowing auras, and idle hovering.
  - Dynamic communication beams/particles connecting interacting agents.
  - Interactive selection: clicking an agent opens their 5-tab drawer.
- **5-Tab Right Drawer**:
  - **Tab 1: Chat**: Direct messaging with selected agent with live updates and prompt dispatching.
  - **Tab 2: Agent Stats (D&D / BG3 Sheet)**: Full character sheet with Class, Level, HP, AC, Ability Scores (STR, DEX, CON, INT, WIS, CHA), Spell Slots, Actions, and interactive D20 dice rolling.
  - **Tab 3: Thought Process**: Live streaming chain-of-thought and reasoning telemetry.
  - **Tab 4: Personal Context**: Visualized memory state, context token usage gauge, active file references.
  - **Tab 5: Relationships & Networks**: Interactive network diagram showing inter-agent communication volume and collaboration hierarchy.
