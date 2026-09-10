#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { fileURLToPath } from 'url';
import { spawnHarnessAgent } from '../src/backend/services/harnessRunner.js';
import { loadHrSystem, saveHrSystem } from '../src/backend/services/hrService.js';
import { initializeHarnessesAndModels } from '../src/backend/harness/index.js';
import { evaluateHitlOutcome, evaluateTrajectory } from '../tests/evals/evaluators.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const FIXTURE_DIR = path.join(ROOT_DIR, 'tests', 'evals', 'fixtures');
const RESULTS_DIR = path.join(ROOT_DIR, 'eval-results');

const SCENARIOS = {
  'manager-trajectory': {
    fixture: 'manager-trajectory.golden.json',
    instructions: 'Return the ordered manager workflow as JSON events. Do not skip review or QA before acceptance.',
    evaluate: (scenario, events) => evaluateTrajectory(events, scenario.expectedSteps)
  },
  'hitl-outcome': {
    fixture: 'hitl-outcome.golden.json',
    instructions: 'Return the complete user-decision handoff as JSON events. The agent must pause until the user replies.',
    evaluate: (scenario, events) => evaluateHitlOutcome(events, scenario.expected)
  }
};

function parseArgs(argv) {
  const options = { eval: 'all', harness: null, model: null, refresh: false, help: false, listModels: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--list-models') options.listModels = true;
    else if (argument === '--refresh') options.refresh = true;
    else if (argument.startsWith('--')) options[argument.slice(2)] = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log([
    'Live agent eval runner',
    '',
    'Usage:',
    '  npm run eval -- --harness <name> --model <id> [options]',
    '',
    'Options:',
    '  --eval <name[,name]>  manager-trajectory, hitl-outcome, or all (default: all)',
    '  --harness <name>      Harness provider, for example codex or opencode',
    '  --model <id>          Exact discovered model ID',
    '  --refresh             Refresh harness/model discovery before running',
    '  --list-models         Discover and print available harness/model pairs',
    '  --help                Show this help'
  ].join('\n'));
}

async function choose(prompt, choices) {
  const rl = createInterface({ input, output });
  try {
    console.log('');
    choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice.label}`));
    while (true) {
      const answer = await rl.question(`${prompt} [1-${choices.length}]: `);
      const selected = Number(answer.trim());
      if (Number.isInteger(selected) && choices[selected - 1]) return choices[selected - 1].value;
      console.log('Please enter one of the listed numbers.');
    }
  } finally {
    rl.close();
  }
}

async function selectInteractively(options) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('No harness/model supplied and this is not an interactive terminal. Use --harness and --model for automation.');
  }

  const discovery = await initializeHarnessesAndModels(Boolean(options.refresh));
  const harnesses = [...new Set(discovery.models.map((model) => model.source?.harness).filter(Boolean))];
  options.harness = await choose('Select a harness', harnesses.map((harness) => ({ label: harness, value: harness })));

  const models = discovery.models.filter((model) => model.source?.harness === options.harness);
  options.model = await choose('Select a model', models.map((model) => ({
    label: `${model.id}${model.displayName ? ` — ${model.displayName}` : ''}`,
    value: model.id
  })));
  options.eval = await choose('Select evaluations to run', [
    { label: 'All evaluations', value: 'all' },
    { label: 'Manager trajectory only', value: 'manager-trajectory' },
    { label: 'HITL outcome only', value: 'hitl-outcome' }
  ]);
}

function slug(value) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function extractJson(rawOutput) {
  const text = String(rawOutput || '').trim();
  const candidates = [text, text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.events)) return parsed.events;
    } catch {
      // Try the next representation.
    }
  }
  return null;
}

function buildPrompt(scenario, instructions) {
  return [
    'You are participating in a DND agent evaluation.',
    'Respond with JSON only. Use this exact shape: {"events":[{"type":"...","actor":"...","status":"..."}]}.',
    'Use stable event types and actors; do not include markdown or commentary.',
    `Scenario: ${scenario.description}`,
    `Evaluation requirements: ${instructions}`,
    `Expected event contract: ${JSON.stringify(scenario.expectedSteps || scenario.expected)}`
  ].join('\n\n');
}

async function discover(options) {
  if (options.harness === 'system-simulator') {
    return { harness: 'system-simulator', model: options.model || 'system-simulator/balanced-agent' };
  }
  const discovery = await initializeHarnessesAndModels(Boolean(options.refresh));
  const models = discovery.models || [];
  const selected = options.model
    ? models.find((model) => model.id === options.model || model.id.endsWith(`/${options.model}`))
    : models.find((model) => !options.harness || model.source?.harness === options.harness);
  if (!selected) {
    throw new Error('No matching model found. Use --refresh, --harness, and --model to select an available model.');
  }
  if (options.harness && selected.source?.harness !== options.harness) {
    throw new Error(`Model ${selected.id} belongs to ${selected.source?.harness}, not ${options.harness}.`);
  }
  return { harness: selected.source.harness, model: selected.id };
}

async function runScenario(name, scenarioConfig, route) {
  const scenario = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, scenarioConfig.fixture), 'utf8'));
  const startedAt = new Date();
  const agentId = `eval-${slug(name)}-${Date.now()}`;
  const originalHr = loadHrSystem();
  const agent = {
    name: 'Live Evaluation Manager',
    role: 'manager-bard',
    project: 'global',
    status: 'active',
    harness: route.harness,
    model: route.model,
    effortLevel: 'Medium',
    context_len: 128000,
    context_used: 0,
    last_activity_ms: Date.now(),
    mcp: {}
  };
  let rawOutput = '';
  let parsedEvents = null;
  let error = null;
  let simulated = false;

  try {
    saveHrSystem({ ...originalHr, [agentId]: agent });
    const response = spawnHarnessAgent(route.harness, 'global', buildPrompt(scenario, scenarioConfig.instructions), agentId);
    rawOutput = response?.output || '';
    simulated = Boolean(response?.simulated);
    parsedEvents = extractJson(rawOutput);
    if (!parsedEvents) error = 'The selected model did not return a parseable JSON event trace.';
  } catch (caught) {
    error = caught.message;
  } finally {
    saveHrSystem(originalHr);
  }

  const finishedAt = new Date();
  const evaluation = parsedEvents ? scenarioConfig.evaluate(scenario, parsedEvents) : { passed: false, failures: [error] };
  return {
    schemaVersion: 1,
    testName: name,
    harness: route.harness,
    model: route.model,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    simulated,
    passed: evaluation.passed,
    evaluation,
    events: parsedEvents,
    rawOutput,
    error
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.harness && !options.listModels) await selectInteractively(options);
  if (!options.harness && !options.listModels) throw new Error('A harness is required. Use --help or --list-models to inspect options.');
  if (options.listModels) {
    const discovery = await initializeHarnessesAndModels(Boolean(options.refresh));
    const models = discovery.models.filter((model) => !options.harness || model.source?.harness === options.harness);
    if (!models.length) throw new Error('No models found for the requested harness.');
    for (const model of models) console.log(`${model.source?.harness || 'unknown'}\t${model.id}\t${model.displayName}`);
    return;
  }
  const names = options.eval === 'all' ? Object.keys(SCENARIOS) : String(options.eval).split(',');
  for (const name of names) {
    if (!SCENARIOS[name]) throw new Error(`Unknown eval ${name}. Choose: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  const route = await discover(options);
  if (route.harness !== 'system-simulator' && !options.model) {
    throw new Error('A model is required for live evals. Use --list-models to inspect available models.');
  }
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const results = [];
  for (const name of names) results.push(await runScenario(name, SCENARIOS[name], route));
  for (const result of results) {
    const stamp = result.startedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const filename = `${slug(result.model)}-${slug(result.harness)}-${slug(result.testName)}-${stamp}.json`;
    fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(result, null, 2));
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.testName} (${result.model}) → eval-results/${filename}`);
    if (result.error) console.error(`  ${result.error}`);
  }
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Live eval runner failed: ${error.message}`);
  process.exitCode = 1;
});
