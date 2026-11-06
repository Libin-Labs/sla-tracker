# @lp-labs/sla-tracker

Pure elapsed-time and breach calculations for service-level objectives. Supply concrete intervals
or an adapter that supplies them. The package does not infer a timezone, holiday calendar, business
hours, or daylight-saving transition.

## Install

```bash
npm install @lp-labs/sla-tracker
```

Requires Node.js 18 or newer. ESM/CommonJS outputs and module-specific TypeScript declarations are
included. ESM: `import { createSlaTracker } from '@lp-labs/sla-tracker'`. CommonJS:
`const { createSlaTracker } = require('@lp-labs/sla-tracker')`.

## Runnable quickstart

Save as `quickstart.mjs` where the package is installed, then run `node quickstart.mjs`.

```js
import { createSlaTracker } from '@lp-labs/sla-tracker';

const tracker = createSlaTracker();
const result = tracker.evaluate({
  startedAt: Date.parse('2026-01-05T09:00:00Z'),
  now: Date.parse('2026-01-05T18:00:00Z'),
  targetMs: 8 * 60 * 60 * 1000,
  calendarIntervals: [
    { start: Date.parse('2026-01-05T09:00:00Z'), end: Date.parse('2026-01-05T17:00:00Z') },
  ],
  pauses: [
    {
      start: Date.parse('2026-01-05T12:00:00Z'),
      end: Date.parse('2026-01-05T13:00:00Z'),
      reason: 'customer-hold',
    },
  ],
});

if (result.breached) throw new Error(`SLA breached at ${new Date(result.breachAt).toISOString()}`);
console.log(result.remainingMs);
```

## Evaluating and customizing clocks

`createSlaTracker(options?: SlaTrackerOptions): SlaTracker` configures an optional
`calendar: SlaCalendar` and interval budget. `SlaCalendar.intervals(from, to)` receives inclusive
epoch-millisecond boundaries and returns explicit active-time intervals. Alternatively, pass
`calendarIntervals` to each `evaluate()` call. Supplying both sources at once is an error. When
neither is supplied, all elapsed wall-clock time is active.

`tracker.evaluate({ startedAt, now, targetMs, calendarIntervals?, pauses? })` accepts safe integer
epoch milliseconds and a positive safe integer target. Calendar and pause intervals are half-open
`[start, end)` ranges; they are clipped to the evaluation window, sorted, and overlapping ranges
are merged to avoid double counting. Intervals with `end <= start` are rejected. Pause intervals
also require a nonempty `reason`; overlapping pauses subtract time only once. The result contains
`elapsedMs`, `remainingMs`, `breached`, and distinct in-window `pauseReasons`. Once the target is
reached, `breachAt` is the exact epoch-millisecond instant when active time crossed the target.

## Calendar and scope limits

The adapter contract is deliberately timezone-neutral: implement calendar expansion in your
application, using your chosen timezone/database/library, and pass UTC epoch intervals. For
recurring schedules, DST rules, local holidays, split shifts, calendar revisions, or jurisdictional
rules, use a dedicated calendar provider; there is no hidden timezone database or implicit
weekday schedule here. The tracker stores no clock state and emits no delivery or escalation event;
call it with the authoritative current time and decide how to persist or notify in your application.

The default maximum is 10,000 calendar or pause intervals per evaluation; configure 1–100,000 with
`maxIntervals`. All intervals are validated and each is processed with bounded sorting work.
Runtime export: `createSlaTracker`. Public types: `SlaInterval`, `SlaPauseInterval`, `SlaCalendar`,
`SlaTrackerOptions`, `SlaEvaluationInput`, `SlaEvaluation`, and `SlaTracker`. There are no runtime
or peer dependencies.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
