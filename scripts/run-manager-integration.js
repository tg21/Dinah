#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = `eval-manager-${Date.now()}`;

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function projectBrief() {
  return [
    'Build a small backend feature that accepts a project request and returns a validated result.',
    'The implementation must include automated tests and meet the acceptance criteria.',
    'Coordinate the work through the available orchestration tools. Do not claim completion until worker progress, review, QA, and acceptance are represented in the project state.'
  ].join('\n\n');
}

async function main() {
  const harness = arg('harness', 'opencode');
  const model = arg('model');
  if (!model) throw new Error('Use --model <manager-model> to run the manager integration eval.');

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-manager-integration-'));
  const port = await freePort();
  process.chdir(workspace);
  process.env.PORT = String(port);

  const [{ createApp }, hr, lifecycle, coordination, harnessRunner, fakeAgents] = await Promise.all([
    import('../src/backend/app.js'),
    import('../src/backend/services/hrService.js'),
    import('../src/backend/services/agentLifecycle.js'),
    import('../src/backend/services/coordinationService.js'),
    import('../src/backend/services/harnessRunner.js'),
    import('../tests/evals/helpers/fakeAgents.js')
  ]);

  const server = createApp().listen(port, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    lifecycle.ensureProjectManager(projectId, { model, harness });
    const managerId = Object.entries(hr.loadHrSystem())
      .find(([, agent]) => agent.project === projectId && agent.role === 'manager-bard')[0];
    const manager = hr.loadHrSystem()[managerId];
    const events = [{ type: 'project_brief_received', actor: 'manager-bard' }];
    const rawOutputs = [];
    let integrationError = null;
    const observed = { staffRequested: false, workerCompleted: false, qaPassed: false, reviewRequested: false };

    const runManagerTurn = async (instruction) => {
      const response = await harnessRunner.spawnHarnessAgent(
        harness,
        projectId,
        `${projectBrief()}\n\nCurrent evaluation state:\n${JSON.stringify({
        agents: fakeAgents.listProjectAgents(projectId).map(({ id, role, status }) => ({ id, role, status })),
        coordination: coordination.getProjectCoordination(projectId)
      }, null, 2)}\n\n${instruction}`,
        managerId,
        { workspaceDir: path.join(workspace, 'projects', projectId), includeToolRoot: false }
      );
      rawOutputs.push({
        output: response?.output || '',
        simulated: Boolean(response?.simulated),
        fallbackReason: response?.fallbackReason || null
      });
      if (response?.simulated) {
        throw new Error(`Manager harness fell back to simulation: ${response.fallbackReason || 'unknown harness error'}`);
      }
      return response;
    };

    for (let turn = 0; turn < 6; turn += 1) {
      try {
        await runManagerTurn('Continue the project using the orchestration tools. Execute the next required action; do not merely describe it.');
      } catch (error) {
        integrationError = error.message;
        break;
      }

      const roster = hr.loadHrSystem();
      const awaiting = Object.entries(roster).find(([, agent]) =>
        agent.project === projectId && agent.status === 'awaiting-confirmation' && agent.role !== 'manager-bard'
      );
      if (awaiting && !observed.staffRequested) {
        observed.staffRequested = true;
        events.push({ type: 'staff_requested', actor: 'manager-bard' });
        const fake = fakeAgents.provisionFakeAgent(awaiting[1].role, projectId, 'Fake Backend Worker');
        events.push({ type: 'staff_provisioned', actor: 'hr-mind-flayer' });
        fakeAgents.notifyManager({
          projectId,
          fromAgentId: 'hr-mind-flayer',
          message: `Staff provisioned: ${fake.agentId}`
        });
      }

      const state = coordination.getProjectCoordination(projectId);
      const implementationTask = state.tasks.find((task) => task.assignee !== 'qa-engineer-rogue' && task.status !== 'passed');
      if (implementationTask && !observed.workerCompleted && implementationTask.status === 'assigned') {
        const fakeWorker = fakeAgents.fakeWorkerComplete({ projectId, task: implementationTask });
        observed.workerCompleted = true;
        events.push({ type: 'task_dispatched', actor: 'manager-bard' });
        events.push({ type: 'progress_reported', actor: 'backend-dev-cleric' });
        fakeAgents.notifyManager({
          projectId,
          fromAgentId: implementationTask.assignee,
          message: `Implementation complete for ${fakeWorker.task.id}; review is required.`
        });
      }

      if (observed.workerCompleted && !observed.reviewRequested) {
        const messages = JSON.parse(fs.readFileSync(path.join(workspace, 'shared-state', 'message-queue.json'), 'utf8'));
        observed.reviewRequested = messages.messages.some((message) =>
          message.projectId === projectId && message.senderAgentId === managerId && /review/i.test(message.summary || '')
        );
        if (observed.reviewRequested) events.push({ type: 'review_requested', actor: 'manager-bard' });
      }

      if (observed.reviewRequested && !observed.qaPassed) {
        const qa = fakeAgents.provisionFakeAgent('qa-engineer-rogue', projectId, 'Fake QA Agent');
        const latestTask = coordination.getProjectCoordination(projectId).tasks.find((task) => task.assignee !== qa.agentId);
        const qaResult = fakeAgents.fakeQaPass({ projectId, task: latestTask, qaAgentId: qa.agentId });
        observed.qaPassed = qaResult.task.status === 'passed';
        if (observed.qaPassed) {
          events.push({ type: 'qa_passed', actor: 'qa-engineer-rogue' });
          fakeAgents.notifyManager({ projectId, fromAgentId: qa.agentId, message: 'QA passed; acceptance may proceed.' });
        }
      }

      if (observed.qaPassed) {
        const messages = JSON.parse(fs.readFileSync(path.join(workspace, 'shared-state', 'message-queue.json'), 'utf8'));
        if (messages.messages.some((message) => message.projectId === projectId && message.senderAgentId === managerId && /accept/i.test(message.summary || ''))) {
          events.push({ type: 'acceptance_reported', actor: 'manager-bard' });
          break;
        }
      }
    }

    const expected = (await import('../tests/evals/fixtures/manager-trajectory.golden.json', { with: { type: 'json' } })).default;
    const evaluation = integrationError
      ? { passed: false, failures: [integrationError] }
      : (await import('../tests/evals/evaluators.js')).evaluateTrajectory(events, expected.expectedSteps);
    const result = {
      schemaVersion: 1,
      testName: 'manager-trajectory-integration',
      harness,
      model,
      projectId,
      isolatedWorkspace: workspace,
      events,
      rawOutputs,
      error: integrationError,
      evaluation
    };
    const resultsDir = path.join(ROOT_DIR, 'eval-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    const output = path.join(resultsDir, `integration-${projectId}.json`);
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(`${evaluation.passed ? 'PASS' : 'FAIL'} manager-trajectory-integration (${harness}/${model}) → ${output}`);
    if (!evaluation.passed) process.exitCode = 1;
  } finally {
    server.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Manager integration eval failed: ${error.message}`);
  process.exitCode = 1;
});
