import assert from "node:assert/strict";

export function stableDashboard(snapshot) {
  const result = structuredClone(snapshot);
  // Only response-generation clocks differ between consecutive read requests.
  const isoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  assert.match(result.health.timestamp, isoTime);
  assert.match(result.haiStatus.generatedAt, isoTime);
  if (result.details) assert.match(result.details.discoveryPlan.generatedAt, isoTime);
  result.health.timestamp = "<response time>";
  result.haiStatus.generatedAt = "<response time>";
  if (result.details) result.details.discoveryPlan.generatedAt = "<response time>";
  return result;
}

export function assertCompactDashboard(full, compact) {
  const expected = stableDashboard(full);
  const actual = stableDashboard(compact);
  const fullLists = [expected.summary.recentActivity, expected.details?.auditEvents || []];
  const compactLists = [actual.summary.recentActivity, actual.details?.auditEvents || []];
  for (const list of compactLists) {
    for (const event of list) {
      assert.equal(Object.hasOwn(event, "beforeState"), false, "Compact audit must omit beforeState");
      assert.equal(Object.hasOwn(event, "afterState"), false, "Compact audit must omit afterState");
    }
  }
  for (const list of fullLists) {
    for (const event of list) {
      assert.ok(Object.hasOwn(event, "beforeState"), "Full audit must retain beforeState");
      assert.ok(Object.hasOwn(event, "afterState"), "Full audit must retain afterState");
      delete event.beforeState;
      delete event.afterState;
    }
  }
  assert.deepEqual(actual, expected, "Compact dashboard changed more than audit snapshots");
}
