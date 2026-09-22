import assert from "node:assert/strict";
import test from "node:test";
import { simulateQueue } from "../../src/.vuepress/components/queue_model.mjs";

test("balanced load has no sustained queue", () => {
  const result = simulateQueue(10, 10, 20);
  assert.equal(result.queued, 0);
  assert.equal(result.totalRejected, 0);
  assert.equal(result.totalServed, 120);
});
test("larger buffer postpones overflow but does not raise processing rate", () => {
  const small = simulateQueue(12, 10, 20);
  const large = simulateQueue(12, 10, 40);
  assert.equal(small.totalServed, large.totalServed);
  assert.ok(small.totalRejected > large.totalRejected);
  assert.ok(large.queued > small.queued);
});
test("all arrivals are accounted for and capacity is respected", () => {
  for (const arrival of [0, 1, 12, 100]) {
    for (const service of [0, 3, 20]) {
      for (const capacity of [0, 5, 20]) {
        const r = simulateQueue(arrival, service, capacity);
        assert.equal(r.totalServed + r.totalRejected + r.queued, arrival * 12);
        assert.ok(r.rows.every((row) => row.queued >= 0 && row.queued <= capacity));
      }
    }
  }
});
test("invalid values are rejected", () => {
  for (const value of [-1, NaN, 1.5, Infinity]) {
    assert.throws(() => simulateQueue(value, 10, 20), RangeError);
  }
});
