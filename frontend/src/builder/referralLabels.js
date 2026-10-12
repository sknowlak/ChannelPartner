import { statusLabel, subStatusLabel } from '../i18n/dataLabels';

// Referral states as builders see them (section 52). The values are what the
// API sends/accepts; the labels are translation keys resolved at render time.
export const REFERRAL_STATUSES = ['PENDING_BUILDER', 'ACCEPTED', 'REJECTED'];
export const REFERRAL_BADGE = { PENDING_BUILDER: 'pending', ACCEPTED: 'accepted', REJECTED: 'rejected' };

export const referralLabel = (t, status) => (REFERRAL_STATUSES.includes(status) ? t(`builder:referralStatus.${status}`) : status);

// The audit endpoint reports the actor as an organization-level type; the
// three fixed ones are translated, a builder actor ("Name (Builder: Org)")
// is shown as-is.
const ACTORS = { System: 'system', 'Channel partner': 'partner', 'Leadrat admin': 'admin' };
export const actorLabel = (t, actor) => (ACTORS[actor] ? t(`builder:history.actor.${ACTORS[actor]}`) : actor);

// History descriptions are stored in English by the server. Known event
// types are re-rendered from their parts; anything else (or a description
// that doesn't match the expected shape) falls back to the server text.
const FIXED_EVENTS = [
  'REGISTRATION_RECEIVED',
  'DUPLICATE_CHECK_COMPLETED',
  'REGISTRATION_ACCEPTED',
  'REFERRAL_ACCEPTED',
  'BOOKING_COMPLETED',
  'OPERATIONAL_OWNERSHIP_TRANSFERRED',
  'PARTNER_ATTRIBUTION_PRESERVED',
  'COMMISSION_ELIGIBILITY_CREATED',
  'HANDOVER_COMPLETED'
];

function stageText(raw) {
  const m = /^(.+?) \((.+)\)$/.exec(raw);
  return m ? `${statusLabel(m[1])} (${subStatusLabel(m[2])})` : statusLabel(raw);
}

export function describeEvent(t, ev) {
  const text = ev.description || '';
  const key = (k, vars) => t(`builder:history.event.${k}`, vars);
  if (FIXED_EVENTS.includes(ev.eventType)) return key(ev.eventType);
  let m;
  switch (ev.eventType) {
    case 'PROTECTION_GRANTED':
      if ((m = /^(\d+)-day protection granted$/.exec(text))) return key('PROTECTION_GRANTED', { count: Number(m[1]) });
      break;
    case 'STAGE_UPDATED':
      if ((m = /^Status updated to (.+)$/.exec(text))) return key('STAGE_UPDATED', { stage: stageText(m[1]) });
      break;
    case 'LEAD_DETAILS_UPDATED':
      if ((m = /^Updated (\d+) fields?$/.exec(text))) return key('LEAD_DETAILS_UPDATED', { count: Number(m[1]) });
      break;
    case 'LEAD_ASSIGNED':
      if (text === 'Unassigned') return key('LEAD_UNASSIGNED');
      if ((m = /^Assigned to (.+)$/.exec(text))) return key('LEAD_ASSIGNED', { name: m[1] });
      break;
    case 'REFERRAL_REJECTED':
      if ((m = /^Builder rejected the referral\. Reason: ([\s\S]*)$/.exec(text))) return key('REFERRAL_REJECTED', { reason: m[1] });
      break;
    case 'REGISTRATION_ATTEMPT_REJECTED':
      if ((m = /^Duplicate registration attempt by (.+) rejected$/.exec(text))) return key('REGISTRATION_ATTEMPT_REJECTED', { partner: m[1] });
      break;
    case 'ADMIN_PROTECTION_RELEASED':
      if ((m = /^Admin released duplicate protection early\. Reason: ([\s\S]*)$/.exec(text))) return key('ADMIN_PROTECTION_RELEASED', { reason: m[1] });
      break;
    case 'ADMIN_PARTNER_REASSIGNED':
      if ((m = /^Admin reassigned registration from (.+?) to (.+?)\. Reason: ([\s\S]*)$/.exec(text))) {
        return key('ADMIN_PARTNER_REASSIGNED', { from: m[1], to: m[2], reason: m[3] });
      }
      break;
    default:
      break;
  }
  return text;
}
