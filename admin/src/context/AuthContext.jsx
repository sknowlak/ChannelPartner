import { createContext, useContext, useEffect, useState } from 'react';
import i18n from 'i18next';
import { getMe, login as loginRequest, updateMe } from '../api/client';
import { detectBrowserTimezone } from '../utils/timezone';
import { rememberLanguage } from '../i18n/language';
import { isSupportedLocale } from '../i18n/locales';

const AuthContext = createContext(null);

// The account's saved language wins once known (section 54); with none
// saved yet, whatever this device is showing stays.
function applyAccountLanguage(language) {
  if (isSupportedLocale(language) && language !== i18n.language) {
    i18n.changeLanguage(language);
    rememberLanguage(language);
  }
}

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try {
      const stored = localStorage.getItem('adminUser');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Admin timezone preference (spec section 32) - a lightweight client-side
  // setting rather than a backend admin-profile field, since it only
  // affects how this browser renders dates, not any stored data.
  const [timezone, setTimezoneState] = useState(() => localStorage.getItem('adminTimezone') || detectBrowserTimezone());

  const setTimezone = (tz) => {
    localStorage.setItem('adminTimezone', tz);
    setTimezoneState(tz);
  };

  const storeAdmin = (next) => {
    localStorage.setItem('adminUser', JSON.stringify(next));
    setAdmin(next);
  };

  // On load, re-read the saved language from the server so a preference
  // set on another device applies here too.
  useEffect(() => {
    if (!admin) return;
    getMe()
      .then(({ data }) => {
        const language = data.admin?.language || '';
        setAdmin((a) => {
          if (!a) return a;
          const merged = { ...a, language };
          localStorage.setItem('adminUser', JSON.stringify(merged));
          return merged;
        });
        applyAccountLanguage(language);
      })
      .catch(() => {}); // an expired/invalid token is handled by the 401 interceptor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email, password) => {
    const { data } = await loginRequest(email, password);
    localStorage.setItem('adminToken', data.token);
    storeAdmin(data.admin);
    applyAccountLanguage(data.admin?.language);
    return data.admin;
  };

  // Switches the UI language now (no reload - route and form state stay)
  // and, when signed in, saves it as the account preference. The UI switch
  // doesn't wait for the save.
  const changeLanguage = (code) => {
    if (!isSupportedLocale(code)) return Promise.resolve();
    i18n.changeLanguage(code);
    rememberLanguage(code);
    if (!admin) return Promise.resolve();
    storeAdmin({ ...admin, language: code });
    return updateMe({ language: code }).catch(() => {});
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, login, logout, timezone, setTimezone, changeLanguage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
