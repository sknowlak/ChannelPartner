// Default lead status catalogue, seeded once per partner (section 49) -
// after that every status/sub-status is the partner's own to rename,
// reorder, deactivate or delete in Settings -> Lead -> Statuses.
//
// Two flags carry the business logic that used to be hardcoded stage names:
//   isDefault - the status every new lead starts in (was 'Registered')
//   isBooking - the status Complete Booking moves a lead to (was 'Booking');
//               never offered in the quick-update picker.
//
// `requiresSchedule` makes the status-update form ask for a date & time
// (a callback, a site visit) - that time is what "N minutes before"
// notification rules count back from.
const sub = (name, extra = {}) => ({ name, isActive: true, requiresSchedule: false, scheduleLabel: '', fields: [], ...extra });

const DEFAULT_LEAD_STATUSES = [
  { name: 'Registered', color: '#2f6fed', isDefault: true, subStatuses: [sub('New Lead'), sub('Not Contacted Yet')] },
  {
    name: 'Contacted',
    color: '#17a2c9',
    subStatuses: [
      sub('Follow Up', { requiresSchedule: true, scheduleLabel: 'Follow-up at' }),
      sub('Callback Requested', { requiresSchedule: true, scheduleLabel: 'Call back at' }),
      sub('Not Answered'),
      sub('Busy'),
      sub('Not Reachable'),
      sub('Need More Info'),
      sub('Plan Postponed'),
      sub('Not Interested')
    ]
  },
  { name: 'Qualified', color: '#12b8a3', subStatuses: [sub('Requirement Confirmed'), sub('Budget Confirmed'), sub('Shortlisting Options')] },
  {
    name: 'Site Visit',
    color: '#b57b2e',
    subStatuses: [
      sub('Scheduled', { requiresSchedule: true, scheduleLabel: 'Visit at' }),
      sub('Rescheduled', { requiresSchedule: true, scheduleLabel: 'Visit at' }),
      sub('Done'),
      sub('Cancelled')
    ]
  },
  { name: 'Negotiation', color: '#5b3df5', subStatuses: [sub('Price Discussion'), sub('Offer Sent'), sub('Awaiting Decision'), sub('Token Pending')] },
  { name: 'Booking', color: '#1a7f3c', isBooking: true, subStatuses: [] }
];

module.exports = { DEFAULT_LEAD_STATUSES };
