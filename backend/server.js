require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const channelPartnerRoutes = require('./src/routes/channelPartnerRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const errorHandler = require('./src/middleware/errorHandler');
const { runWithContext } = require('./src/utils/requestContext');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Two entirely separate API surfaces: partner/builder-facing (no auth layer
// of its own) and admin-facing (JWT-protected, see src/middleware/adminAuth.js).
app.use('/api/channel-partner', channelPartnerRoutes);
app.use('/api/admin', adminRoutes);

// Every client here parses errors as JSON (err.response.data.reason) -
// Express's default 404 is an HTML page, which would otherwise reach the
// frontend as an unparseable response instead of a normal error.
app.use((req, res) => res.status(404).json({ reason: 'Not found' }));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
