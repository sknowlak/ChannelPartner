// Notification rule timing presets (section 49) - "immediate, 15 min, 30
// min, 1 day, 1 month, 1 year before..." - plus a Custom option for any
// amount/unit/before-after combination.
export const TIMING_PRESETS = [
  { key: 'IMMEDIATE', label: 'Immediately when the status is set', timing: { mode: 'IMMEDIATE', amount: 0, unit: 'MINUTES' } },
  { key: 'B15M', label: '15 minutes before scheduled time', timing: { mode: 'BEFORE', amount: 15, unit: 'MINUTES' } },
  { key: 'B30M', label: '30 minutes before scheduled time', timing: { mode: 'BEFORE', amount: 30, unit: 'MINUTES' } },
  { key: 'B1H', label: '1 hour before scheduled time', timing: { mode: 'BEFORE', amount: 1, unit: 'HOURS' } },
  { key: 'B1D', label: '1 day before scheduled time', timing: { mode: 'BEFORE', amount: 1, unit: 'DAYS' } },
  { key: 'B1W', label: '1 week before scheduled time', timing: { mode: 'BEFORE', amount: 1, unit: 'WEEKS' } },
  { key: 'B1MO', label: '1 month before scheduled time', timing: { mode: 'BEFORE', amount: 1, unit: 'MONTHS' } },
  { key: 'B1Y', label: '1 year before scheduled time', timing: { mode: 'BEFORE', amount: 1, unit: 'YEARS' } },
  { key: 'AT', label: 'At the scheduled time', timing: { mode: 'AT', amount: 0, unit: 'MINUTES' } },
  { key: 'A15M', label: '15 minutes after scheduled time', timing: { mode: 'AFTER', amount: 15, unit: 'MINUTES' } },
  { key: 'A1D', label: '1 day after scheduled time (follow-up check)', timing: { mode: 'AFTER', amount: 1, unit: 'DAYS' } }
];

export const TIMING_UNITS = ['MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'YEARS'];

export function presetKeyFor(timing) {
  const hit = TIMING_PRESETS.find((p) => p.timing.mode === timing.mode
    && (timing.mode === 'IMMEDIATE' || timing.mode === 'AT' || (p.timing.amount === timing.amount && p.timing.unit === timing.unit)));
  return hit ? hit.key : 'CUSTOM';
}

export function describeTiming(timing) {
  if (!timing || timing.mode === 'IMMEDIATE') return 'Immediately';
  if (timing.mode === 'AT') return 'At scheduled time';
  const unit = timing.unit.toLowerCase();
  const amount = timing.amount === 1 ? `1 ${unit.replace(/s$/, '')}` : `${timing.amount} ${unit}`;
  return `${amount} ${timing.mode === 'BEFORE' ? 'before' : 'after'} scheduled time`;
}
