import { describe, expect, it } from 'vitest';
import fixture from './fixtures/manager-integration-driver.regression.json';
import {
  hasPublishedPlan,
  isReviewQaTask,
  managerMessageMatches,
  selectAwaitingStaff,
  selectImplementationTask,
  selectQaTarget
} from './helpers/integrationDriver.js';

describe('manager integration eval driver (regression: integration-eval-manager-1789054325841)', () => {
  it('records plan_published as soon as the manager creates its first task', () => {
    expect(hasPublishedPlan([])).toBe(false);
    expect(hasPublishedPlan(fixture.tasks)).toBe(true);
  });

  it('serves every awaiting-confirmation role, not just the first', () => {
    const awaiting = selectAwaitingStaff(fixture.roster, fixture.projectId, []);
    expect(awaiting.map((entry) => entry.role).sort()).toEqual([...fixture.expected.awaitingRoles].sort());
    // Already-served requests are not provisioned again on later turns.
    const again = selectAwaitingStaff(
      fixture.roster,
      fixture.projectId,
      awaiting.map((entry) => entry.agentId)
    );
    expect(again).toEqual([]);
  });

  it('drives the oldest implementation task even though nothing is still exactly assigned-only in spirit', () => {
    // The old policy (first task with status === assigned, no exclusions)
    // picked the manager-held arch task shape or nothing once the manager
    // moved work to in_progress; the fixed selector skips the manager-held
    // arch task and lands on the backend implementation task.
    const selected = selectImplementationTask(fixture.tasks, { managerId: fixture.managerId });
    expect(selected?.id).toBe(fixture.expected.implementationTaskId);

    // The manager-held setup task itself is never completed by a fake worker.
    const managerOnly = selectImplementationTask(
      [fixture.tasks[0]],
      { managerId: fixture.managerId }
    );
    expect(managerOnly).toBeNull();

    // Review/QA placeholders are never completed as implementation work.
    const reviewQaOnly = selectImplementationTask(
      fixture.tasks.filter((task) => isReviewQaTask(task)),
      { managerId: fixture.managerId }
    );
    expect(reviewQaOnly).toBeNull();

    // Docs wait until QA has passed.
    const docsOnly = [{ id: 'task-docs', title: 'Documentation', assignee: 'backend-developer', status: 'assigned' }];
    expect(selectImplementationTask(docsOnly, { managerId: fixture.managerId })).toBeNull();
    expect(selectImplementationTask(docsOnly, { managerId: fixture.managerId, qaPassed: true })?.id).toBe('task-docs');
  });

  it('targets QA at the worker-completed task instead of the first listed task', () => {
    const target = selectQaTarget(fixture.tasks, 'task-impl');
    expect(target?.id).toBe(fixture.expected.qaTargetForCompletedImpl);
  });

  it('detects review/acceptance signals in message summaries and payloads', () => {
    const messages = [
      { projectId: fixture.projectId, senderAgentId: fixture.managerId, summary: 'Work packet for implementation', payload: { message: 'Build it' } },
      { projectId: fixture.projectId, senderAgentId: fixture.managerId, summary: 'Status ping', payload: { message: 'Please review the completed implementation' } }
    ];
    expect(managerMessageMatches(messages, { projectId: fixture.projectId, managerId: fixture.managerId, pattern: /review/i })).toBe(true);
    expect(managerMessageMatches(messages, { projectId: fixture.projectId, managerId: fixture.managerId, pattern: /accept/i })).toBe(false);
  });
});
