import i18n from 'i18next';

// What to show for a failed request. The server's own `reason` is shown
// as-is (the backend is language-neutral); only the client-side fallbacks
// are translated (section 54).
export function errorMessage(err) {
  const reason = err?.response?.data?.reason;
  if (reason) return reason;
  return err?.response ? i18n.t('common:states.error') : i18n.t('common:states.networkError');
}
