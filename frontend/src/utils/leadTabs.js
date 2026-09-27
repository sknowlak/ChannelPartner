// Shared by RegisterLead.jsx, EditLead.jsx, and PartnerJourney.jsx (sections
// 39/40) so Add/Edit/View Lead always agree on tab order, even though the
// actual tab set is derived live from whatever groups exist in the
// partner's enabled LeadFieldDefinition list.
export const LEAD_TAB_ORDER = ['Lead Info', 'Enquiry Info', 'Additional Info', 'Others', 'Notes'];

export function sortLeadTabs(groups) {
  return [...groups].sort((a, b) => {
    const ai = LEAD_TAB_ORDER.indexOf(a);
    const bi = LEAD_TAB_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
