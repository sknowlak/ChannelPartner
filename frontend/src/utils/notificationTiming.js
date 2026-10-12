import i18n from 'i18next';

// Notification rule timing presets (section 49) - "immediate, 15 min, 30
// min, 1 day, 1 month, 1 year before..." - plus a Custom option for any
// amount/unit/before-after combination. Labels are produced at render time
// by presetLabel() so they follow the current language.
export const TIMING_PRESETS = [
  { key: 'IMMEDIATE', timing: { mode: 'IMMEDIATE', amount: 0, unit: 'MINUTES' } },
  { key: 'B15M', timing: { mode: 'BEFORE', amount: 15, unit: 'MINUTES' } },
  { key: 'B30M', timing: { mode: 'BEFORE', amount: 30, unit: 'MINUTES' } },
  { key: 'B1H', timing: { mode: 'BEFORE', amount: 1, unit: 'HOURS' } },
  { key: 'B1D', timing: { mode: 'BEFORE', amount: 1, unit: 'DAYS' } },
  { key: 'B1W', timing: { mode: 'BEFORE', amount: 1, unit: 'WEEKS' } },
  { key: 'B1MO', timing: { mode: 'BEFORE', amount: 1, unit: 'MONTHS' } },
  { key: 'B1Y', timing: { mode: 'BEFORE', amount: 1, unit: 'YEARS' } },
  { key: 'AT', timing: { mode: 'AT', amount: 0, unit: 'MINUTES' } },
  { key: 'A15M', timing: { mode: 'AFTER', amount: 15, unit: 'MINUTES' } },
  { key: 'A1D', timing: { mode: 'AFTER', amount: 1, unit: 'DAYS' } }
];

export const TIMING_UNITS = ['MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'YEARS'];

// Presets with wording of their own; the rest read like describeTiming().
const PRESET_LABEL_KEYS = new Set(['IMMEDIATE', 'AT', 'A1D']);

export function presetKeyFor(timing) {
  const hit = TIMING_PRESETS.find((p) => p.timing.mode === timing.mode
    && (timing.mode === 'IMMEDIATE' || timing.mode === 'AT' || (p.timing.amount === timing.amount && p.timing.unit === timing.unit)));
  return hit ? hit.key : 'CUSTOM';
}

export function presetLabel(preset) {
  if (PRESET_LABEL_KEYS.has(preset.key)) return i18n.t(`settings:timing.presets.${preset.key}`);
  return describeTiming(preset.timing);
}

// Translated, pluralised unit name for the custom-timing unit picker.
export function unitLabel(unit, amount) {
  return i18n.t(`settings:timing.units.${unit}`, { count: amount });
}

export function describeTiming(timing) {
  if (!timing || timing.mode === 'IMMEDIATE') return i18n.t('settings:timing.immediately');
  if (timing.mode === 'AT') return i18n.t('settings:timing.atScheduled');
  const direction = timing.mode === 'BEFORE' ? 'before' : 'after';
  return i18n.t(`settings:timing.${direction}.${timing.unit}`, { count: timing.amount });
}
