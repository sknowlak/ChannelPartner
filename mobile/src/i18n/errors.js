import i18n from 'i18next';

// What to show for a failed request. Server reasons are shown as-is (the
// backend is language-neutral); only client-side fallbacks are translated.
export function errorMessage(err) {
  if (err?.response?.data?.reason) return err.response.data.reason;
  if (err?.configError) return configErrorMessage(err.configError);
  if (!err?.response) return i18n.t('common:states.networkError');
  return i18n.t('common:states.error');
}

// API_CONFIG_ERROR codes from api/client.js ('noApiAddress' / 'insecureApiAddress').
export function configErrorMessage(code) {
  return code ? i18n.t(`auth:config.${code}`) : null;
}
