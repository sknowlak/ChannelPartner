import { createContext, useContext, useEffect, useState } from 'react';
import i18n from 'i18next';
import { getMyProfile, loginPartner, registerPartner, updateMyProfile } from '../api/client';
import { rememberLanguage } from '../i18n/language';
import { isSupportedLocale } from '../i18n/locales';

const AuthContext = createContext(null);

// Only what the UI shows about the signed-in user is cached in
// localStorage - never the full profile, which for an owner includes bank
// account, PAN and similar details that anything able to read localStorage
// (an XSS bug, a browser extension, a shared computer) could otherwise take.
const CACHED_FIELDS = ['partnerId', 'memberId', 'username', 'name', 'email', 'mobile', 'companyName', 'timezone', 'currency', 'language'];

// The account's saved language wins once known (section 54); with none
// saved yet, whatever this device is showing stays.
function applyAccountLanguage(language) {
  if (isSupportedLocale(language) && language !== i18n.language) {
    i18n.changeLanguage(language);
    rememberLanguage(language);
  }
}

function toCached(profile, extra) {
  const cached = {};
  for (const key of CACHED_FIELDS) if (profile?.[key] !== undefined) cached[key] = profile[key];
  return { ...cached, ...extra };
}

export function AuthProvider({ children }) {
  const [partner, setPartner] = useState(() => {
    try {
      const stored = localStorage.getItem('partnerUser');
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      // Also rewrites caches written by older versions that stored everything.
      const trimmed = toCached(parsed, { role: parsed.role, roleName: parsed.roleName, permissions: parsed.permissions || [] });
      localStorage.setItem('partnerUser', JSON.stringify(trimmed));
      return trimmed;
    } catch {
      return null;
    }
  });

  const persist = (data) => {
    const merged = toCached(data.partner, { role: data.role, roleName: data.roleName, permissions: data.permissions || [] });
    localStorage.setItem('partnerToken', data.token);
    localStorage.setItem('partnerUser', JSON.stringify(merged));
    setPartner(merged);
    applyAccountLanguage(merged.language);
    return merged;
  };

  // Self-heals a session cached before `role`/`permissions` existed on the
  // token (or any other profile drift) by re-pulling the authoritative
  // record from the server once on load, instead of trusting whatever was
  // cached at login. Permissions are always re-derived server-side per
  // request anyway (section 34) - this just keeps the UI in sync with that.
  useEffect(() => {
    if (!partner) return;
    getMyProfile()
      .then(({ data }) => {
        const merged = toCached({ ...partner, ...data.profile }, { role: data.role, roleName: data.roleName, permissions: data.permissions || [] });
        localStorage.setItem('partnerUser', JSON.stringify(merged));
        setPartner(merged);
        applyAccountLanguage(merged.language);
      })
      .catch(() => {}); // an expired/invalid token here is handled by the 401 interceptor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (username, password) => {
    const { data } = await loginPartner(username, password);
    return persist(data);
  };

  const register = async (payload) => {
    const { data } = await registerPartner(payload);
    return persist(data);
  };

  // `token` is passed after a password change: the server revokes every
  // token issued before it, so the session continues on the new one.
  const updateLocalPartner = (profile, token) => {
    if (token) localStorage.setItem('partnerToken', token);
    setPartner((p) => {
      const merged = toCached({ ...p, ...profile }, { role: p?.role, roleName: p?.roleName, permissions: p?.permissions || [] });
      localStorage.setItem('partnerUser', JSON.stringify(merged));
      return merged;
    });
  };

  // Switches the UI language now (no reload - route and form state stay)
  // and, when signed in, saves it as the account preference so it follows
  // the user to other devices. The UI switch doesn't wait for the save.
  const changeLanguage = (code) => {
    if (!isSupportedLocale(code)) return Promise.resolve();
    i18n.changeLanguage(code);
    rememberLanguage(code);
    if (!partner) return Promise.resolve();
    setPartner((p) => {
      const merged = { ...p, language: code };
      localStorage.setItem('partnerUser', JSON.stringify(merged));
      return merged;
    });
    return updateMyProfile({ language: code }).catch(() => {});
  };

  const hasPermission = (permission) => Boolean(partner?.permissions?.includes(permission));

  const logout = () => {
    localStorage.removeItem('partnerToken');
    localStorage.removeItem('partnerUser');
    setPartner(null);
  };

  return (
    <AuthContext.Provider value={{ partner, login, register, logout, updateLocalPartner, hasPermission, changeLanguage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
