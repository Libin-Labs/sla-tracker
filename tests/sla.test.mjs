import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createSlaTracker } from '../dist/esm/index.js';

test('counts continuously available time and reports the exact breach instant', () => {
  const tracker = createSlaTracker();
  assert.deepEqual(tracker.evaluate({ startedAt: 1000, now: 5000, targetMs: 3000 }), {
    elapsedMs: 4000,
    remainingMs: 0,
    breached: true,
    breachAt: 4000,
    pauseReasons: [],
  });
});

test('explicit calendar intervals clip to the evaluation window and merge overlaps', () => {
  const result = createSlaTracker().evaluate({
    startedAt: 0,
    now: 20,
    targetMs: 12,
    calendarIntervals: [
      { start: -10, end: 5 },
      { start: 4, end: 10 },
      { start: 15, end: 30 },
    ],
  });
  assert.equal(result.elapsedMs, 15);
  assert.equal(result.breachAt, 17);
});

test('calendar adapter supplies caller-owned working periods without timezone assumptions', () => {
  const calls = [];
  const tracker = createSlaTracker({
    calendar: {
      intervals(from, to) {
        calls.push([from, to]);
        return [
          { start: 10, end: 20 },
          { start: 30, end: 40 },
        ];
      },
    },
  });
  const result = tracker.evaluate({ startedAt: 0, now: 50, targetMs: 15 });
  assert.deepEqual(calls, [[0, 50]]);
  assert.equal(result.elapsedMs, 20);
  assert.equal(result.breachAt, 35);
});

test('pauses subtract overlapping active time and retain distinct reason labels', () => {
  const result = createSlaTracker().evaluate({
    startedAt: 0,
    now: 100,
    targetMs: 60,
    pauses: [
      { start: 20, end: 50, reason: 'customer' },
      { start: 40, end: 60, reason: 'maintenance' },
      { start: 150, end: 160, reason: 'outside' },
    ],
  });
  assert.equal(result.elapsedMs, 60);
  assert.equal(result.breachAt, 100);
  assert.deepEqual(result.pauseReasons, ['customer', 'maintenance']);
});

test('pauses are applied only to calendar working intervals', () => {
  const result = createSlaTracker().evaluate({
    startedAt: 0,
    now: 40,
    targetMs: 15,
    calendarIntervals: [
      { start: 0, end: 10 },
      { start: 20, end: 40 },
    ],
    pauses: [{ start: 5, end: 25, reason: 'hold' }],
  });
  assert.equal(result.elapsedMs, 20);
  assert.equal(result.breachAt, 35);
});

test('reports not breached when target remains and supports empty time windows', () => {
  const tracker = createSlaTracker();
  assert.deepEqual(tracker.evaluate({ startedAt: 10, now: 10, targetMs: 1 }), {
    elapsedMs: 0,
    remainingMs: 1,
    breached: false,
    pauseReasons: [],
  });
  const noWork = tracker.evaluate({
    startedAt: 0,
    now: 100,
    targetMs: 1,
    calendarIntervals: [],
  });
  assert.equal(noWork.elapsedMs, 0);
  assert.equal(noWork.remainingMs, 1);
});

test('validates timestamps, target duration, interval shape, and exclusive calendar sources', () => {
  const tracker = createSlaTracker({ calendar: { intervals: () => [] } });
  assert.throws(() => tracker.evaluate({ startedAt: 2, now: 1, targetMs: 1 }), /precede/);
  assert.throws(() => tracker.evaluate({ startedAt: 0, now: 1, targetMs: 0 }), /targetMs/);
  assert.throws(() => tracker.evaluate({ startedAt: 0.5, now: 1, targetMs: 1 }), /safe integer/);
  assert.throws(
    () => tracker.evaluate({ startedAt: 0, now: 10, targetMs: 1, calendarIntervals: [] }),
    /not both/,
  );
  assert.throws(
    () =>
      createSlaTracker().evaluate({
        startedAt: 0,
        now: 10,
        targetMs: 1,
        calendarIntervals: [{ start: 5, end: 5 }],
      }),
    /after its start/,
  );
  assert.throws(() => createSlaTracker({ maxIntervals: 0 }), /maxIntervals/);
});

test('validates pause reasons and bounds explicit intervals', () => {
  assert.throws(
    () =>
      createSlaTracker().evaluate({
        startedAt: 0,
        now: 10,
        targetMs: 1,
        pauses: [{ start: 1, end: 2, reason: '' }],
      }),
    /Pause reason/,
  );
  assert.throws(
    () =>
      createSlaTracker({ maxIntervals: 1 }).evaluate({
        startedAt: 0,
        now: 10,
        targetMs: 1,
        calendarIntervals: [
          { start: 0, end: 1 },
          { start: 2, end: 3 },
        ],
      }),
    /exceeds 1/,
  );
  assert.throws(
    () =>
      createSlaTracker().evaluate({
        startedAt: 0,
        now: 10,
        targetMs: 1,
        calendarIntervals: [],
        pauses: [{ start: 3, end: 2, reason: 'bad' }],
      }),
    /after its start/,
  );
});

test('bounds non-overlapping intervals too and rejects unsafe duration windows', () => {
  function* outsideIntervals() {
    yield { start: 100, end: 101 };
    yield { start: 200, end: 201 };
  }
  assert.throws(
    () =>
      createSlaTracker({ maxIntervals: 1 }).evaluate({
        startedAt: 0,
        now: 10,
        targetMs: 1,
        calendarIntervals: outsideIntervals(),
      }),
    /exceeds 1/,
  );
  assert.throws(
    () =>
      createSlaTracker().evaluate({
        startedAt: -Number.MAX_SAFE_INTEGER,
        now: Number.MAX_SAFE_INTEGER,
        targetMs: 1,
      }),
    /window exceeds safe integer/,
  );
  assert.throws(
    () =>
      createSlaTracker({ calendar: { intervals: () => undefined } }).evaluate({
        startedAt: 0,
        now: 10,
        targetMs: 1,
      }),
    /must be iterable/,
  );
});

test('CommonJS entry point calculates SLA intervals', () => {
  const api = createRequire(import.meta.url)('../dist/cjs/index.js');
  const result = api.createSlaTracker().evaluate({ startedAt: 0, now: 20, targetMs: 5 });
  assert.equal(result.breachAt, 5);
});
