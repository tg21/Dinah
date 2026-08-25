# DND: Modular AI Agent Orchestrator

A playful, modular, and visual AI agent orchestration platform inspired by Dungeons & Dragons and Baldur's Gate 3. DND runs autonomous, role-based AI agents inside interactive project playgrounds, managed by an LLM-agnostic backend and overseen by an executive layer.

---

## 1. System Vision & Architecture

```
═══════════════════════════════════════════════════════════════════════════
                 👑 GLOBAL EXECUTIVE OUTER LAYER
   [ CEO Warlock ]        [ HR Mind Flayer ]       [ Staff Engineer Paladin ]
  (Initiates Strategy)   (Exclusive Spawner)       (Oath of Clean Code)
═══════════════════════════════════════════════════════════════════════════
                                │
               Spawns on new project creation ONLY
                                │
                                ▼
═══════════════════════════════════════════════════════════════════════════
                 🏰 PROJECT PLAYGROUND CANVAS (Interactive)
                 [ Manager Bard (Project Router) ]
                                │
             Summons specialists on demand via HR
                                │
      ┌─────────────────────────┼─────────────────────────┐
      ▼                         ▼                         ▼
 [ Solution Architect ]   [ Backend Dev ]           [ QA Rogue ]
     (Wizard)                (Cleric)               (Assassin)
      ┌─────────────────────────┼─────────────────────────┐
      ▼                         ▼                         ▼
 [ Frontend Dev ]         [ DevOps SRE ]            [ Others... ]
    (Sorcerer)             (Warmage)
═══════════════════════════════════════════════════════════════════════════
                                │
                       Runs every 5 minutes
                                │
                                ▼
                 🛡️ MARSHALL SENTINEL AGENT
       (Context Exhaustion, Stuck Process & Obsolete Cleanup)
```

---

## 2. Core Operating Rules & Hierarchy

1. **Outer Layer (Global Executive Roster)**:
   - **CEO Warlock** (`ceo-warlock`): Eldritch strategic leader bound to the Board. Initiates all new company projects.
   - **HR Mind Flayer** (`hr-mind-flayer`): Sole authority permitted to spawn, mutate, or retire agents. Maintains `hr-system/hr-system.json`.
   - **Staff Engineer Paladin** (`staff-engineer-paladin`): Enforces the Sacred Oath of Clean Code, reviewing system-wide architecture.
   - *Rule*: Global agents live permanently in the top outer layer and do **not** wander individual project playgrounds.

2. **Project Playground & Spawning Lifecycle**:
   - *Rule*: **No worker agents are spawned by default.**
   - When a new project is created, HR spawns **only** a **Manager Bard** (`manager-bard`) for that project.
   - Additional worker agents (Wizard, Cleric, Sorcerer, Rogue, etc.) are only spawned on-demand when summoned via HR or delegated by the Manager.
   - The playground canvas displays only the active agents assigned to the currently active project.

3. **Live AI Agent Thought Telemetry**:
   - Agents continuously stream real-time thought states (*"Marinating on requirements..."*, *"Pondering type safety..."*, *"Brewing async queries..."*, *"Stabbing boundary edge cases..."*).
   - Displayed in bouncy Anime.js speech bubbles directly above animated avatars on the canvas and in the 5-tab drawer.

4. **Marshall Sentinel Watchdog (Every 5 Minutes)**:
   - Scans for context exhaustion (>90% token limit used) and triggers handover workflows.
   - Scans for stuck tasks (processes idle for >10 mins) and flags for human-in-the-loop review.
   - Inspects completed workers and coordinates with HR to safely retire obsolete agents.

---

## 3. What Has Been Done (Completed)

- [x] **Animated Fantasy Landscape Playground**:
  - Replaced static nodes with an interactive 2D canvas featuring lush terrain, winding cobblestone roads, glowing crystal mana pond with reflections/ripples, and themed workstations (Agile Desk, Blueprint Monolith, DevOps Forge, etc.).
  - Custom procedural pixel-art character sprites with walk cycles, directional flipping, tool animations (Lute, Staff, Sword, Hammer, Daggers, Orbs), and particle effects.
  - Interactive smooth panning, zooming, and click-to-select functionality.
- [x] **Top Outer Layer (Executive Penthouse)**:
  - Persistent executive bar housing CEO Warlock, HR Mind Flayer, and Staff Engineer Paladin with live thought previews and one-click drawer access.
- [x] **Dynamic AI Thought & Speech Bubbles**:
  - Floating speech bubbles with Anime.js bounce pop-in displaying live thoughts and simulated/harness reasoning.
- [x] **Strict Spawning Rules**:
  - Registry initialized with only the 3 global agents.
  - Project creation spawns only `manager-bard`.
- [x] **5-Tab Baldur's Gate 3 / D&D Drawer**:
  - **Tab 1 (Chat)**: Real-time messaging, prompt execution, suggestion chips, and conversation logs.
  - **Tab 2 (Stats)**: Full character sheet with AC, HP bar, Level, STR/DEX/CON/INT/WIS/CHA with modifier calculations, interactive D20 dice roller with critical success/fail styling, spells, and inventory.
  - **Tab 3 (Thoughts)**: Streaming step logs and reasoning telemetry (`agent-${id}.thoughts.json`).
  - **Tab 4 (Context)**: Token usage gauge and project directory file explorer.
  - **Tab 5 (Network)**: Inter-agent relationship graph.
- [x] **Backend Infrastructure (`backend.js`)**:
  - Express server on port 2121 with CORS, project isolation in `projects/<id>`, HR registry in `hr-system/hr-system.json`, append-only message logs in `hr-system/agent-<id>.msgs.json`, and shared audit log in `shared-state/shared-state.log`.
  - Harness integration architecture supporting OpenCode, Claude Code, Codex, and Gemini CLI.
  - Automated 5-minute Marshall sentinel audit cycle.
- [x] **23 Agent Archetype Templates** in `agent-templates/`.

---

## 4. Scope & Roadmap (What Needs To Be Done Next)

1. **Subprocess Streaming & Harness Handshakes**:
   - Implement live child-process stdout/stderr streaming from actual CLIs (`opencode`, `claude-code`, `codex`, `gemini`) into the frontend chat and thought tabs.
   - Handle OAuth and token configurations for external LLM CLI providers.

2. **Autonomous Inter-Agent Delegation Loop**:
   - Enable Manager Bard to parse user prompts, autonomously call HR endpoints to summon required specialists (e.g. Solution Architect Wizard + Backend Cleric), and route task tickets to them without manual user intervention.

3. **In-Drawer Code & Artifact Viewer**:
   - Allow clicking files in Tab 4 (Personal Context) to open a code editor/syntax-highlighted preview with diff comparisons directly in the drawer.

4. **Marshall Automated Handover Engine**:
   - When an agent's context exceeds 95%, automate the generation of `handover-<agentId>.md` and instruct HR Mind Flayer to spawn a successor agent injecting the handover context.

5. **Multi-Agent Battle / Code Review Simulations**:
   - Visual animations for code reviews: QA Rogue sparring with Backend Cleric or Paladin casting *Divine Smite* on lint errors in the playground canvas.

---

## 5. Directory Structure

```
.
├── backend.js                  # Express API server & orchestrator backend
├── frontend.html               # Main Web UI with Canvas Playground & BG3 Drawer
├── AGENT.md                    # Project blueprint, scope, and status
├── requirements.md             # System functional requirements specification
├── package.json                # Project dependencies
├── hr-system/
│   ├── hr-system.json          # HR agent registry (active agents, stats, states)
│   ├── agent-<id>.msgs.json    # Agent append-only message logs
│   └── agent-<id>.thoughts.json# Agent telemetry thought logs
├── projects/
│   ├── project-alpha/          # Project Alpha workspace directory
│   └── project-beta/           # Project Beta workspace directory
├── agent-templates/            # Markdown templates for 23 agent archetypes
└── shared-state/
    └── shared-state.log        # System-wide audit log
```

---

## 6. How to Run & Develop

1. **Start the backend server**:
   ```bash
   node backend.js
   ```

2. **Open the web interface**:
   Navigate to [http://localhost:2121](http://localhost:2121) in your browser.

3. **Verify API health**:
   - `GET /api/agents`: View active agent roster
   - `GET /api/agent-thoughts`: View live thought states
   - `POST /api/marshall/run`: Trigger manual Marshall health inspection
