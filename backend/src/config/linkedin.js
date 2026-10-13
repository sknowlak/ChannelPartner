// LinkedIn connector settings (section 59). The app itself (client ID and
// secret) belongs to Leadrat; each channel partner connects their own
// LinkedIn member account to it with OAuth and picks which ad accounts to
// sync. The *_BASE overrides exist only for the local mock
// (tests/e2e/mockLinkedIn.mjs) - production always talks to LinkedIn.

const PORT = process.env.PORT || 5000;

function linkedinConfig() {
  return {
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
    redirectUri: process.env.LINKEDIN_REDIRECT_URI || `http://localhost:${PORT}/api/channel-partner/connectors/linkedin/callback`,
    // Where the browser lands after connecting (the partner app's LinkedIn page).
    appUrl: (process.env.PARTNER_APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),
    authBase: (process.env.LINKEDIN_AUTH_BASE || 'https://www.linkedin.com/oauth/v2').replace(/\/+$/, ''),
    apiBase: (process.env.LINKEDIN_API_BASE || 'https://api.linkedin.com/rest').replace(/\/+$/, ''),
    // LinkedIn-Version header (YYYYMM). Each version is supported for at
    // least 12 months; move it forward when LinkedIn announces a sunset.
    apiVersion: process.env.LINKEDIN_API_VERSION || '202609',
    // Public HTTPS URL of /connectors/linkedin/webhook. When set, a lead
    // notification subscription is registered per ad account so leads
    // arrive in seconds; without it leads are fetched on a schedule.
    webhookUrl: process.env.LINKEDIN_WEBHOOK_URL || '',
    // LINKEDIN_SCOPES (space-separated) overrides the list - e.g. while only
    // some LinkedIn products are approved for the app.
    scopes: process.env.LINKEDIN_SCOPES ? process.env.LINKEDIN_SCOPES.split(/[\s,]+/).filter(Boolean) : [
      'r_ads',
      'r_ads_reporting',
      'r_marketing_leadgen_automation',
      'r_organization_admin',
      'rw_conversions',
      'r_basicprofile'
    ]
  };
}

const isConfigured = () => {
  const c = linkedinConfig();
  return Boolean(c.clientId && c.clientSecret);
};

module.exports = { linkedinConfig, isConfigured };
