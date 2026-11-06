import {
  createSlaTracker,
  type SlaCalendar,
  type SlaEvaluation,
  type SlaEvaluationInput,
  type SlaInterval,
  type SlaPauseInterval,
  type SlaTracker,
  type SlaTrackerOptions,
} from '@lp-labs/sla-tracker';

const intervals: SlaInterval[] = [{ start: 0, end: 100 }];
const pauses: SlaPauseInterval[] = [{ start: 20, end: 30, reason: 'review' }];
const calendar: SlaCalendar = { intervals: () => intervals };
const options: SlaTrackerOptions = { calendar };
const tracker: SlaTracker = createSlaTracker(options);
const input: SlaEvaluationInput = { startedAt: 0, now: 100, targetMs: 50, pauses };
const result: SlaEvaluation = tracker.evaluate(input);
void result;
