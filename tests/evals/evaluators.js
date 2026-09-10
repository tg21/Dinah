/**
 * Small, deterministic evaluators for agent traces.
 * These operate on plain JSON so a captured production trace can become a
 * regression case without importing the backend or invoking a model.
 */
export function evaluateTrajectory(events, expectedSteps) {
  const failures = [];
  let cursor = -1;

  for (const step of expectedSteps) {
    const index = events.findIndex((event, candidateIndex) => {
      if (candidateIndex <= cursor || event.type !== step.type) return false;
      return !step.actor || event.actor === step.actor;
    });

    if (index === -1) {
      failures.push(`Missing trajectory step: ${step.actor ? `${step.actor} ` : ''}${step.type}`);
    } else {
      cursor = index;
    }
  }

  return { passed: failures.length === 0, failures };
}

export function evaluateHitlOutcome(events, expected = {}) {
  const failures = [];
  const requiredTypes = expected.requiredTypes || [
    'user_question_asked',
    'agent_waiting_for_user',
    'user_replied',
    'agent_resumed',
    'outcome_delivered'
  ];
  const types = events.map((event) => event.type);
  let cursor = -1;

  for (const type of requiredTypes) {
    const index = types.indexOf(type, cursor + 1);
    if (index === -1) failures.push(`Missing HITL transition: ${type}`);
    else cursor = index;
  }

  if (expected.finalStatus) {
    const finalStatus = events.at(-1)?.status;
    if (finalStatus !== expected.finalStatus) {
      failures.push(`Expected final status ${expected.finalStatus}, received ${finalStatus}`);
    }
  }

  return { passed: failures.length === 0, failures };
}
