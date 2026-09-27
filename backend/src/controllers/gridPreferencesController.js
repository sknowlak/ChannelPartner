const Partner = require('../models/Partner');
const TeamMember = require('../models/TeamMember');

// Column layout (order + hidden columns) for a data grid like My Leads -
// keyed by an arbitrary gridKey so the same pair of endpoints covers every
// grid the app ever adds, not just this one. Scoped to the CALLER's own
// identity (owner or the specific team member), never to partnerId alone -
// each person's "Manage Columns" choice is theirs, the same way timezone is.
function identity(req) {
  return req.role === 'MEMBER'
    ? { Model: TeamMember, query: { memberId: req.memberId } }
    : { Model: Partner, query: { partnerId: req.partnerId } };
}

// GET /api/channel-partner/my/grid-preferences/:gridKey
async function getGridPreferences(req, res, next) {
  try {
    const { Model, query } = identity(req);
    const doc = await Model.findOne(query);
    if (!doc) return res.status(404).json({ reason: 'Account not found' });
    return res.json({ preferences: doc.gridPreferences?.[req.params.gridKey] || null });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/channel-partner/my/grid-preferences/:gridKey
async function updateGridPreferences(req, res, next) {
  try {
    const { order, hidden } = req.body;
    if (!Array.isArray(order) || !Array.isArray(hidden)) {
      return res.status(400).json({ reason: 'order and hidden must be arrays' });
    }

    const { Model, query } = identity(req);
    const doc = await Model.findOne(query);
    if (!doc) return res.status(404).json({ reason: 'Account not found' });

    doc.gridPreferences = { ...doc.gridPreferences, [req.params.gridKey]: { order, hidden } };
    doc.markModified('gridPreferences'); // Mixed-type field - deep changes aren't auto-detected
    await doc.save();

    return res.json({ preferences: doc.gridPreferences[req.params.gridKey] });
  } catch (err) {
    next(err);
  }
}

module.exports = { getGridPreferences, updateGridPreferences };
