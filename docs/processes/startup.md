# Process — startup (first run, boot, model delegation)

- **CEO startup model delegation**. When the frontend sends `"ceo"` for a top-level agent during first-run setup, the backend loads `prompts/ceo-select-top-level-models.md`, sends the selected CEO a candidate list and role requirements, validates the returned model IDs, and records the request/result in the CEO message log, thought log, and shared audit log. The prompt must remain provider-neutral and merit-based.
- **Startup selection observability**. The compact CEO request/result belongs in the CEO message/thought logs; the complete prompt, raw harness response, parsed decision, timing, and resolved assignments belong in `<working-area>/shared-state/startup-model-selection.json`.
- **Startup service workspace path**. `src/backend/services/startupService.js` must import `APP_DIR` from `config.js` when recording workspace-relative message/audit paths; `APP_DIR` is the active working directory alias.
- **First-run UI**. The `StartupSetup` modal and grouped model selectors are mapped in `systems/frontend.md`.
