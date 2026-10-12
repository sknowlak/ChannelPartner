import i18n from 'i18next';

// Where a referral stands with the builder (section 54). The enum value
// stays as the API sends it; only the label is translated, at render time
// (leads:referral.<STATUS>) so it follows a language switch.
const REFERRAL_STATUSES = ['NOT_REFERRED', 'PENDING_BUILDER', 'ACCEPTED', 'REJECTED'];

export function referralLabel(status) {
  return REFERRAL_STATUSES.includes(status) ? i18n.t(`leads:referral.${status}`) : '';
}
