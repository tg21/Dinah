# System — frontend (React UI map and UI rules)

Vite + React 18 UI (own `package.json`, `vite.config.js`, `index.html`). Entry `src/main.jsx`, shell `src/App.jsx`.

## Where things live (`src/frontend/src/`)

- `api/client.js` — all backend fetch calls (including `subscribeEvents` for SSE).
- `store/AppContext.jsx` — global agent/project/model/MCP/modal state; `defaultHarness` kept as silent send fallback, no UI selector.
- `constants/` — `roles.js` roster + `roleConf` legacy helper; `startup.js` labels/effort/quick prompts.
- `utils/` — `format.js` (escaping + 900-char collapse); `cost.js` (spawn estimate + model grouping).
- `components/Layout/` — `TopNav` (no harness dropdown), `ExecutiveBar` (global overseers).
- `components/Roster/` — `RosterRail` (BG3-style collapsible/scrollable project-party rail).
- `components/Agents/` — all cosmetics isolated here: `agentPalettes.js` (neutral soft sets), `roleSilhouettes.js` (fallback + template-table lookup; shapes live in `agent-templates/*/sprite`, served by `GET /api/roles`), `appearance.js` (persisted-look resolver), `AgentSprite.jsx` (pixel-SVG adventurer with limb/tool-arm/hand-glow groups + sleep + hover-only bubbles + thought ping), `AgentAvatar.jsx` (round portrait), `MailSprite.jsx` (soft envelope).
- `components/PlayArea/` — `PlayArea.jsx` shell (badges/popover/zoom); `PlayAreaScene.jsx` orchestrator exposing legacy engineRef API + UI-only waypoint walker (walk/cast/flourish/sleep) + fit-layout responsive world (fractional coordinates re-rendered to the exact container box on resize via ResizeObserver; undistorted sprites/objects, stretch-safe backdrop; clamped pan, zoom-to-cursor; drag-pan never selects agents); `layers/` swappable `BackdropLayer` (per-project `biomes.js` variants) / `WorldObjectsLayer` / `AgentsLayer` / `CouriersLayer` + `positions.js` deterministic placement (objects z1 always below agents z10, couriers z20).
- `components/Drawer/` — `Drawer` always mounted (collapse is a CSS slide so chat/tab state survives) + `ChatTab` (autogrow textarea), `StatsTab`, `ThoughtsTab`, `ContextTab`, `BrainView` (three.js), `NetworkTab`, Messages tab (see `messaging.md`).
- `components/Modals/` — `Modal` shell + `UserQuestionModal` (BG3-style bottom-center translucent question dialog: radio options + free-text choice, submits via `sendMessage`) + `StartupSetup`, `NewProject`, `ProjectSettings`, `SpawnAgent`, `AgentEdit`, `McpManagement`, `KnowledgeBase`, `MarshallAudit`.
- `styles/global.css` — soft parchment RPG theme, ink-on-cream text; per-biome theme vars via `body[data-biome]`.

## UI rules

- **Long-log UI behavior**. Message and thought renderers must collapse entries over 900 characters by default, show a short preview, and constrain expanded content with scrollable overflow and word wrapping.
- **Model selectors**. First-run CEO and executive-council selectors reuse the grouped model presentation from Configure Agent Capabilities: models are grouped by harness and provider, with capability/context details shown on each option.
- **Roster sync**. Subscription and event handling live here, but the contract (event types, no polling) is defined in `messaging.md` — read that before touching sync code. `agent_needs_user` / `agent_informs_user` refresh the roster + open drawer (chat-only traffic); the `awaiting-user` sprite ring + badge is the question animation, informs arrive as highlighted chat bubbles.
- **Chat vs Messages + autoscroll**. Chat shows user⇄agent chat (questions/notices flagged); Messages shows agent-to-agent traffic only. Both settle on the latest message when opened or grown; Messages renders oldest-first.
