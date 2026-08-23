# Next Agent to Spawn: Harness Integration Agent

## Mission: Implement harness CLI integration for agent spawning

## Current Status
✅ HR system JSON initialized with CEO and HR agents
✅ Project folder creation working
✅ Agent message passing system operational
✅ Shared state log functioning
✅ Backend architecture complete in `backend.js`
✅ `plan.md` created with roadmap
✅ `user_todo.md` created with 16 research tasks

## Next Priority: Harness Integration

### Abstract Functions Needed (from `backend.js` TODOs)

1. **spawnOpencodeAgent(projectId, prompt, agentId)** - TODO in backend.js:210
   - Must invoke `opencode` CLI subprocess
   - Pass project directory and prompt as context
   - Capture output and return status

2. **spawnClaudeCodeAgent(projectId, prompt, agentId)** - TODO in backend.js:253
   - Must invoke `claude` (Claude Code) CLI subprocess
   - Handle Anthropic API integration

3. **spawnCodexAgent(projectId, prompt, agentId)** - TODO in backend.js:296
   - Must invoke `codex` CLI subprocess
   - Handle OpenAI Responses API

4. **spawnGeminiAgent(projectId, prompt, agentId)** - TODO in backend.js:339
   - Must invoke `gemini` CLI subprocess
   - Handle OAuth authentication

5. **findHarnessBinary(harnessName)** - TODO in backend.js:382
   - Check PATH for each harness binary
   - Return binary path or null

### Implementation Steps

**Step 1: Test harness binary availability**
```bash
which opencode
which claude-code || which claude
which codex
which gemini
```

**Step 2: Implement simple spawn test for one harness**
- Start with opencode since it's "open-model path"
- Create `spawnOpencodeAgent()` that uses `child_process.execSync`
- Basic version: just run opencode with --dir and prompt
- Later: add streaming output, error handling, timeout

**Step 3: Test actual invocation**
```javascript
const { execSync } = require('child_process');
try {
  const output = execSync('opencode --dir ./projects/project-alpha "List files"', {
    cwd: './projects/project-alpha',
    timeout: 30000,
    encoding: 'utf-8'
  });
  console.log('Opencode output:', output);
} catch (e) {
  console.log('Exit code:', e.status);
  console.log('Stderr:', e.stderr);
}
```

**Step 4: Wire into backend API**
- Modify `handleSendMessage` in backend.js to actually spawn harness
- After appending message to agent's msgs.json, spawn the harness
- Capture output and update agent status

### Success Criteria
- [ ] Can invoke `opencode --dir <project> "<prompt>"` from Node.js
- [ ] Can invoke other harness CLIs similarly
- [ ] Agent messages trigger actual agent execution
- [ ] Output captured and stored somewhere accessible
- [ ] Error handling for missing binaries, timeouts, etc.

## Spawn Action Required

**Create file:** `harness-integration-test.js`
- Test invoking each harness binary
- Document output format
- Note any issues/limitations

**Then proceed to:**
1. Implement `spawnOpencodeAgent()` in backend.js
2. Test with actual opencode CLI
3. Repeat for other harnesses
4. Wire into the frontend API endpoints

---
*Following the DND system architecture where CEO delegates → HR spawns → Manager requests agents → Workers execute via harnesses.*