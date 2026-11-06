import { createSlaTracker, type SlaEvaluation } from '@lp-labs/sla-tracker';

const result: SlaEvaluation = createSlaTracker().evaluate({ startedAt: 0, now: 10, targetMs: 5 });
void result.breached;
