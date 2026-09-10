#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_VENV="$ROOT_DIR/.venv/dinah-orchestration"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but was not found in PATH." >&2
  exit 1
fi

PYTHON_BIN=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v "$candidate")"
    break
  fi
done

if [[ -z "$PYTHON_BIN" ]]; then
  echo "Error: python3 or python is required to create the orchestration MCP venv." >&2
  exit 1
fi

echo "Installing backend dependencies..."
npm --prefix "$ROOT_DIR" install

echo "Installing frontend dependencies..."
npm --prefix "$ROOT_DIR/src/frontend" install

if [[ ! -x "$PYTHON_VENV/bin/python" ]]; then
  echo "Creating Python venv at $PYTHON_VENV..."
  "$PYTHON_BIN" -m venv "$PYTHON_VENV"
fi

echo "Installing orchestration MCP Python dependencies..."
"$PYTHON_VENV/bin/python" -m pip install --upgrade pip
"$PYTHON_VENV/bin/python" -m pip install -r "$ROOT_DIR/mcp/servers/dinah-orchestration/requirements.txt"

echo
echo "Setup complete. Start the app with: npm start"
