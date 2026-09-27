import { createContext, useContext, useEffect, useState } from 'react';
import { getMyProfile, loginPartner, registerPartner } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [partner, setPartner] = useState(() => {
    const stored = localStorage.getItem('partnerUser');
    return stored ? JSON.parse(stored) : null;
  });

  const persist = (data) => {
    const merged = { ...data.partner, role: data.role, roleName: data.roleName, permissions: data.permissions || [] };
    localStorage.setItem('partnerToken', data.token);
    localStorage.setItem('partnerUser', JSON.stringify(merged));
    setPartner(merged);
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
        const merged = { ...partner, ...data.profile, role: data.role, roleName: data.roleName, permissions: data.permissions || [] };
        localStorage.setItem('partnerUser', JSON.stringify(merged));
        setPartner(merged);
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

  const updateLocalPartner = (profile) => {
    setPartner((p) => {
      const merged = { ...p, ...profile };
      localStorage.setItem('partnerUser', JSON.stringify(merged));
      return merged;
    });
  };

  const hasPermission = (permission) => Boolean(partner?.permissions?.includes(permission));

  const logout = () => {
    localStorage.removeItem('partnerToken');
    localStorage.removeItem('partnerUser');
    setPartner(null);
  };

  return (
    <AuthContext.Provider value={{ partner, login, register, logout, updateLocalPartner, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
