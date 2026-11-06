export interface SlaInterval {
  start: number;
  end: number;
}

export interface SlaPauseInterval extends SlaInterval {
  reason: string;
}

export interface SlaCalendar {
  intervals(from: number, to: number): Iterable<SlaInterval>;
}

export interface SlaTrackerOptions {
  calendar?: SlaCalendar;
  maxIntervals?: number;
}

export interface SlaEvaluationInput {
  startedAt: number;
  now: number;
  targetMs: number;
  calendarIntervals?: readonly SlaInterval[];
  pauses?: readonly SlaPauseInterval[];
}

export interface SlaEvaluation {
  elapsedMs: number;
  remainingMs: number;
  breached: boolean;
  breachAt?: number;
  pauseReasons: readonly string[];
}

export interface SlaTracker {
  evaluate(input: SlaEvaluationInput): SlaEvaluation;
}

const DEFAULT_MAX_INTERVALS = 10_000;

function timestamp(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value))
    throw new TypeError(`${name} must be a safe integer epoch millisecond.`);
}

function label(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError(`${name} must be a nonempty string up to 128 characters.`);
  }
}

function validateInterval(interval: unknown, name: string): asserts interval is SlaInterval {
  if (!interval || typeof interval !== 'object')
    throw new TypeError(`${name} must be an interval.`);
  const candidate = interval as SlaInterval;
  timestamp(candidate.start, `${name}.start`);
  timestamp(candidate.end, `${name}.end`);
  if (candidate.end <= candidate.start)
    throw new RangeError(`${name}.end must be after its start.`);
  if (!Number.isSafeInteger(candidate.end - candidate.start)) {
    throw new RangeError(`${name} duration exceeds safe integer milliseconds.`);
  }
}

function collectIntervals(
  input: Iterable<SlaInterval>,
  start: number,
  end: number,
  limit: number,
  name: string,
): SlaInterval[] {
  if (input == null || typeof input[Symbol.iterator] !== 'function') {
    throw new TypeError(`${name} must be iterable.`);
  }
  const clipped: SlaInterval[] = [];
  let count = 0;
  for (const interval of input) {
    if (count >= limit) throw new RangeError(`${name} exceeds ${limit} intervals.`);
    count++;
    validateInterval(interval, name);
    const clippedStart = Math.max(start, interval.start);
    const clippedEnd = Math.min(end, interval.end);
    if (clippedEnd > clippedStart) clipped.push({ start: clippedStart, end: clippedEnd });
  }
  clipped.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: SlaInterval[] = [];
  for (const interval of clipped) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push(interval);
  }
  return merged;
}

function activeSegments(
  work: readonly SlaInterval[],
  pauses: readonly SlaInterval[],
): SlaInterval[] {
  const active: SlaInterval[] = [];
  let pauseIndex = 0;
  for (const interval of work) {
    let cursor = interval.start;
    while (pauseIndex < pauses.length && pauses[pauseIndex]!.end <= cursor) pauseIndex++;
    let index = pauseIndex;
    while (index < pauses.length && pauses[index]!.start < interval.end) {
      const pause = pauses[index]!;
      if (pause.start > cursor)
        active.push({ start: cursor, end: Math.min(pause.start, interval.end) });
      cursor = Math.max(cursor, pause.end);
      if (cursor >= interval.end) break;
      index++;
    }
    if (cursor < interval.end) active.push({ start: cursor, end: interval.end });
  }
  return active;
}

export function createSlaTracker(options: SlaTrackerOptions = {}): SlaTracker {
  const maxIntervals = options.maxIntervals ?? DEFAULT_MAX_INTERVALS;
  if (!Number.isInteger(maxIntervals) || maxIntervals < 1 || maxIntervals > 100_000) {
    throw new RangeError('maxIntervals must be an integer from 1 to 100000.');
  }
  if (options.calendar !== undefined && typeof options.calendar.intervals !== 'function') {
    throw new TypeError('calendar must provide an intervals(from, to) function.');
  }
  return {
    evaluate(input) {
      if (!input || typeof input !== 'object')
        throw new TypeError('Expected an SLA evaluation input.');
      timestamp(input.startedAt, 'startedAt');
      timestamp(input.now, 'now');
      if (input.now < input.startedAt) throw new RangeError('now must not precede startedAt.');
      if (!Number.isSafeInteger(input.now - input.startedAt)) {
        throw new RangeError('Evaluation window exceeds safe integer milliseconds.');
      }
      if (!Number.isSafeInteger(input.targetMs) || input.targetMs < 1) {
        throw new RangeError('targetMs must be a positive safe integer.');
      }
      if (input.calendarIntervals !== undefined && options.calendar !== undefined) {
        throw new TypeError('Provide calendarIntervals or a calendar adapter, not both.');
      }
      let calendarSource: Iterable<SlaInterval>;
      if (input.calendarIntervals !== undefined) calendarSource = input.calendarIntervals;
      else if (options.calendar !== undefined) {
        calendarSource = options.calendar.intervals(input.startedAt, input.now);
      } else {
        calendarSource =
          input.now === input.startedAt ? [] : [{ start: input.startedAt, end: input.now }];
      }
      const work = collectIntervals(
        calendarSource,
        input.startedAt,
        input.now,
        maxIntervals,
        'Calendar intervals',
      );
      const pauseInput = input.pauses ?? [];
      if (!Array.isArray(pauseInput)) throw new TypeError('pauses must be an array.');
      if (pauseInput.length > maxIntervals)
        throw new RangeError(`pauses exceeds ${maxIntervals} intervals.`);
      const pauseReasons: string[] = [];
      for (const pause of pauseInput) {
        const reason = pause.reason;
        validateInterval(pause, 'Pause interval');
        label(reason, 'Pause reason');
        if (pause.start < input.now && pause.end > input.startedAt) {
          if (!pauseReasons.includes(reason)) pauseReasons.push(reason);
        }
      }
      const pauses = collectIntervals(
        pauseInput,
        input.startedAt,
        input.now,
        maxIntervals,
        'Pause intervals',
      );
      const active = activeSegments(work, pauses);
      let elapsedMs = 0;
      let breachAt: number | undefined;
      for (const segment of active) {
        const duration = segment.end - segment.start;
        if (elapsedMs + duration >= input.targetMs) {
          if (breachAt === undefined) breachAt = segment.start + (input.targetMs - elapsedMs);
        }
        elapsedMs += duration;
      }
      const breached = elapsedMs >= input.targetMs;
      return {
        elapsedMs,
        remainingMs: Math.max(0, input.targetMs - elapsedMs),
        breached,
        ...(breached && breachAt !== undefined ? { breachAt } : {}),
        pauseReasons,
      };
    },
  };
}
