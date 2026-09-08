# Shipped MCP directory

This directory contains MCP servers shipped with Dinah and tracked by git. Keep
user-installed or user-authored MCPs out of this directory; they belong in the
active working directory's `user-mcps/` folder and are managed from the UI.

The backend presents both registries as one inventory. Shipped entries are
marked `sourceType: "shipped"`; user entries are marked `sourceType: "user"`.

Each entry has this shape:

```json
{
  "id": "filesystem",
  "name": "Filesystem",
  "description": "Read project files",
  "command": "node",
  "args": ["/absolute/path/to/mcp/server.js"],
  "tools": [
    { "name": "read_file", "description": "Read a file" }
  ]
}
```

Agents receive only the MCP servers and tool names enabled in their inventory. The orchestrator writes a temporary per-invocation manifest and removes it after the harness exits.
