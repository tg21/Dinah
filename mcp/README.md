# Shared MCP directory

Place downloaded MCP servers below this directory and register them in `registry.json`.

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
