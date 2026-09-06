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


## 7. Things to fix - TODO
1. its possible to zoom out of Arena/Playground leaving it black area on right and bottom. we should not be able to zoom out unless we zoomed in. and we should not be able to zoom out more than we had zoomed in. original size should stay. similarly panning should also only work when zoomed in.
2. side chat panel should be collapsible and should not block the view of the playground and agents. arena would need resize based on whether chat panel is open or not.
3. The character stats in tab2 should be more in line with the capabilites of the agent. e.g what model, effort level etc is being used. and the UI should reflect that.
4. default harness at top is good, we need that for CEO and HR agent and per project manager (we can change that per manager if needed). but we should be able to select harness/llm to use for other agents. and this should be reflected in the UI. i.e when manager gets a task for project and needs to get more agents, then manager should request agents based on what is neeed and what models, and harnesses are available. we can have a per project budget and track cost that can help make these decisions. Based on this manager should suggests agents in first, they'll appear with 'awaiting confirmation' tag, then if confirmed theyll be summoned to arena. maybe with glowing blue ambers around them as if they are ready to be teleported in arena. the user can then choose to tweak their stats, harness/llm, or other params and then confirm summoning them. If we can display cost implementations for teaks before confirmation then that's a bonus.
5. the templates in agent-templates are not suitable for use. they need to be populated with more realistic prompts, tool usage examples, and task flows. real skills that that particualar AI agent needs to do that work. along with bit of personality only for thier responses, their personality should not affect the quality of their work, that should only be based on skills that we specify, (refer to resources like skills.sh for better skills per role.)
6. CEO, HR and Staff Engineer should also be in the arena, just sepearte from other near top and should be shared with every project. they are like overseers. Also there should be a senior analyst. like marshall, senior analyst will trigger every 5-10 minutes (Configurable) and will go and se what is happening in the projects and maintain a company wide knowledge base (from which staff engineer and architect can read data and make further decisions). how should that context be stored that's a question, a vector database?
7. Everything about agents should be configurable. except their agent template.md and their base prompt. their name, type, class, level, ac, hp, ability scores, signature spells/abilities, responsibilities & rules, tool usage, conversation style and other parameters should be configurable. They should be pausable/stopable, e.g if someone doesn't want to spend on analyst then taht should be fine, Staff engineer should know then to look elsewere for context( find out more about project himself from user and documents provided).
8. Marshall is same as cleaner agent, he should also be inside arena (Shared for all projects). should run every 5 minutes unless already running. then it should be killed. and the recreated after 5 minutes so that it doesn't run out of context itself.before dying, it should create a sorted list of agents based on their remaining context, and in its next life it should start checking from agent that was close to running out of context and so on. its context should be persistant so that it can continue from where it left off.
9. When agents are working they should look like they are working toward a common goal like building something, they can be doing different things like one building fire or one cutting tree or one builidng a castle, but they should look like their goal is same and that they are collaborating. When one agent sends a meesage to another or needs their help then it should be animated that they are goint to target agent and dropping a message to them *(symbolic like a letter)
10. Project directory should be changable.
11. context visualization tab should also show the 3d visualization of context vectors (like a brain) if possible.
