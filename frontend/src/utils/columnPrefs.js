import { getGridPreferences, updateGridPreferences } from '../api/client';

// Per-account column show/hide + order, persisted server-side (see
// backend/src/controllers/gridPreferencesController.js) - scoped to
// whichever identity the request's token belongs to (the owner, or a
// specific team member), so it follows that account to any device/browser
// instead of living in one browser's localStorage.

function reconcile(saved, defaultOrder) {
  const knownKeys = new Set(defaultOrder);
  // Keep only keys that still exist (a field may have been deleted from
  // Settings since this preference was saved), then append any brand-new
  // keys the account hasn't seen yet so newly-added fields still show up.
  const order = saved.order.filter((k) => knownKeys.has(k));
  for (const k of defaultOrder) if (!order.includes(k)) order.push(k);
  const hidden = saved.hidden.filter((k) => knownKeys.has(k));
  return { order, hidden };
}

export async function loadColumnPrefs(gridKey, defaultOrder, defaultHidden = []) {
  try {
    const { data } = await getGridPreferences(gridKey);
    if (!data.preferences) return { order: defaultOrder, hidden: defaultHidden };
    return reconcile(data.preferences, defaultOrder);
  } catch {
    return { order: defaultOrder, hidden: defaultHidden };
  }
}

export function saveColumnPrefs(gridKey, prefs) {
  return updateGridPreferences(gridKey, prefs).catch(() => {});
}
