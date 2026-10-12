import i18n from 'i18next';

// On-screen label for an enum VALUE the API sends (ACTIVE, PENDING_BUILDER,
// RELEASE_PROTECTION...). The value itself is never changed - filters,
// payloads and CSS classes keep using it; only what is rendered is
// translated (locales/<lang>/enums.json). An unknown value is shown as-is.
export function enumLabel(group, value) {
  if (value === undefined || value === null || value === '') return value;
  const key = `enums:${group}.${value}`;
  return i18n.exists(key) ? i18n.t(key) : value;
}
