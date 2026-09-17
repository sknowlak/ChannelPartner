import { createContext, useContext, useState } from 'react';
import { login as loginRequest } from '../api/client';
import { detectBrowserTimezone } from '../utils/timezone';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    const stored = localStorage.getItem('adminUser');
    return stored ? JSON.parse(stored) : null;
  });

  // Admin timezone preference (spec section 32) - a lightweight client-side
  // setting rather than a backend admin-profile field, since it only
  // affects how this browser renders dates, not any stored data.
  const [timezone, setTimezoneState] = useState(() => localStorage.getItem('adminTimezone') || detectBrowserTimezone());

  const setTimezone = (tz) => {
    localStorage.setItem('adminTimezone', tz);
    setTimezoneState(tz);
  };

  const login = async (email, password) => {
    const { data } = await loginRequest(email, password);
    localStorage.setItem('adminToken', data.token);
    localStorage.setItem('adminUser', JSON.stringify(data.admin));
    setAdmin(data.admin);
    return data.admin;
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, login, logout, timezone, setTimezone }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
