import i18n from 'i18next';

// What to show for a failed request. The server's own `reason` is shown
// as-is (the backend is language-neutral); only the client-side fallbacks
// are translated (section 54).
// The server's requestId (when sent) is appended so support can find the
// matching log line.
export function errorMessage(err) {
  const data = err?.response?.data;
  const message = data?.reason || (err?.response ? i18n.t('common:states.error') : i18n.t('common:states.networkError'));
  return data?.requestId ? i18n.t('common:states.errorRef', { message, requestId: data.requestId }) : message;
}
