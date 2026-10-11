// A registration's own contact details (section 52) in the shape every
// client already reads as `customer` (name, mobile, email, alternateMobile,
// mobileDialCode, mobileNationalNumber) - so partner screens, webhooks and
// the public API show THIS partner's copy, never the shared Customer record.
const CONTACT_FIELDS = ['name', 'mobile', 'email', 'alternateMobile'];

function contactView(registration) {
  const c = (registration && registration.contact) || {};
  return {
    name: c.name || '',
    mobile: c.mobile || '',
    mobileCountryCode: c.mobileCountryCode || '',
    mobileDialCode: c.mobileDialCode || '',
    mobileNationalNumber: c.mobileNationalNumber || '',
    email: c.email || '',
    alternateMobile: c.alternateMobile || ''
  };
}

module.exports = { CONTACT_FIELDS, contactView };
