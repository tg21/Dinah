import { describe, expect, it } from 'vitest';
import trajectoryScenario from './fixtures/manager-trajectory.golden.json';
import hitlScenario from './fixtures/hitl-outcome.golden.json';
import { evaluateHitlOutcome, evaluateTrajectory } from './evaluators.js';
import { extractJson } from '../../scripts/run-evals.js';

describe('evaluator sanity checks', () => {
  it('accepts a valid trajectory contract and rejects a missing QA event', () => {
    expect(evaluateTrajectory(trajectoryScenario.events, trajectoryScenario.expectedSteps)).toEqual({
      passed: true,
      failures: []
    });

    const withoutQa = trajectoryScenario.events.filter((event) => event.type !== 'qa_passed');
    const result = evaluateTrajectory(withoutQa, trajectoryScenario.expectedSteps);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('Missing trajectory step: qa_passed');
  });

  it('accepts a valid HITL contract and rejects a missing user reply', () => {
    expect(evaluateHitlOutcome(hitlScenario.events, hitlScenario.expected)).toEqual({
      passed: true,
      failures: []
    });

    const withoutReply = hitlScenario.events.filter((event) => event.type !== 'user_replied');
    const result = evaluateHitlOutcome(withoutReply, hitlScenario.expected);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('Missing HITL transition: user_replied');
  });

  it('extracts event traces with a preamble, suffix, or markdown fence', () => {
    const trace = JSON.stringify({ events: trajectoryScenario.events });
    expect(extractJson(`Returning the trace. ${trace}`)).toEqual(trajectoryScenario.events);
    expect(extractJson(`\n\`\`\`json\n${trace}\n\`\`\`\n`)).toEqual(trajectoryScenario.events);
    expect(extractJson(`${trace}\nDone.`)).toEqual(trajectoryScenario.events);
  });
});
