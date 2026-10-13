require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const channelPartnerRoutes = require('./src/routes/channelPartnerRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const builderRoutes = require('./src/routes/builderRoutes');
const errorHandler = require('./src/middleware/errorHandler');
const { runWithContext } = require('./src/utils/requestContext');
const { startScheduler } = require('./src/services/notificationService');
const { startRetryScheduler } = require('./src/services/webhookService');
const { startPullScheduler } = require('./src/services/pullService');
const { startLinkedInScheduler } = require('./src/services/linkedin/linkedinConnectorService');
const { runP0Migrations } = require('./src/migrations/p0AccessControl');
const { runTimezoneMigration } = require('./src/migrations/timezoneAutomatic');

const stripOperators = require('./src/middleware/stripOperators');

const app = express();

// Behind a reverse proxy (nginx, a load balancer), set TRUST_PROXY=1 so
// req.ip is the real client - the login rate limiter keys on it.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.disable('x-powered-by');

// Security headers for a JSON API (section 52): no sniffing, no framing, no
// referrer leaks, nothing executable, and HTTPS-only once in production.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy': 'same-site'
  });
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// CORS_ORIGINS (comma-separated) limits which web origins may call the API
// from a browser. Unset = any origin, which is fine for local development
// but should be set in production. The mobile app is unaffected (native
// requests carry no Origin).
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));
// The raw bytes are kept so incoming signed webhooks (section 51) can be
// verified against exactly what was sent.
const keepRawBody = (req, res, buf) => { req.rawBody = buf; };
app.use(express.json({ limit: '1mb', verify: keepRawBody, type: ['application/json', 'application/*+json'] }));
app.use(express.urlencoded({ extended: true, limit: '1mb', verify: keepRawBody }));
app.use(express.text({ limit: '1mb', verify: keepRawBody, type: ['text/plain'] }));
app.use(stripOperators);

// Every client we control (web partner portal, mobile app, admin portal)
// identifies itself with X-Client-Platform - this is what lets the lead
// History timeline (section 41) show "how" an action was done without
// threading a platform argument through every controller/service call.
const PLATFORM_LABELS = { WEB: 'Web app', MOBILE: 'Mobile app', ADMIN: 'Admin Portal' };
app.use((req, res, next) => {
  const header = (req.headers['x-client-platform'] || '').toUpperCase();
  const platform = PLATFORM_LABELS[header] || 'External';
  runWithContext({ platform }, next);
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Two entirely separate API surfaces: partner/builder-facing (see
// channelPartnerRoutes.js for which routes need which credential) and
// admin-facing (JWT-protected, see src/middleware/adminAuth.js).
app.use('/api/channel-partner', channelPartnerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/builder', builderRoutes);

// Every client here parses errors as JSON (err.response.data.reason) -
// Express's default 404 is an HTML page, which would otherwise reach the
// frontend as an unparseable response instead of a normal error.
app.use((req, res) => res.status(404).json({ reason: 'Not found' }));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Last line of defence: a stray rejected promise is logged instead of
// taking the whole API down (Node's default for unhandled rejections).
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

connectDB()
  .then(() => runP0Migrations())
  .then(() => runTimezoneMigration())
  .then(() => {
    app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
    // Fires scheduled lead notifications (section 49) every 30 seconds.
    if (process.env.NODE_ENV !== 'test') {
      startScheduler();
      // Automatic webhook retries and scheduled API pulls (section 51).
      startRetryScheduler();
      startPullScheduler();
      startLinkedInScheduler();
    }
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
