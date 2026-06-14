// @refresh reset
/**
 * context/AuthContext.jsx — Global authentication state
 *
 * Provides user object, login, logout, and register actions
 * to the entire application via React Context.
 *
 * Note: @refresh reset tells Vite to do a full component reset on HMR
 * instead of a partial update, which avoids the Fast Refresh warning
 * caused by mixing component (AuthProvider) and hook (useAuth) exports.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // True while verifying stored token

  // ─── Restore session from localStorage on mount ──────────────────────────────
  useEffect(() => {
    const storedUser  = localStorage.getItem('mediq_user');
    const storedToken = localStorage.getItem('mediq_token');

    if (storedUser && storedToken) {
      try {
        // Optimistically set user from cache so the UI doesn't flash
        setUser(JSON.parse(storedUser));
        // Silently verify the token is still valid in the background
        authService.getMe()
          .then((data) => {
            // Update user with latest data from server
            if (data?.user) {
              setUser(data.user);
              localStorage.setItem('mediq_user', JSON.stringify(data.user));
            }
          })
          .catch(() => {
            // Token expired or invalid — clear everything
            localStorage.removeItem('mediq_token');
            localStorage.removeItem('mediq_user');
            setUser(null);
          });
      } catch {
        // Malformed cache — clear it
        localStorage.removeItem('mediq_user');
        localStorage.removeItem('mediq_token');
      }
    }

    setLoading(false);
  }, []);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const login = async (email, password) => {
    const data = await authService.login({ email, password });
    persistSession(data.token, data.user);
    return data;
  };

  const register = async (name, email, password) => {
    const data = await authService.register({ name, email, password });
    persistSession(data.token, data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('mediq_token');
    localStorage.removeItem('mediq_user');
    setUser(null);
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('mediq_user', JSON.stringify(updatedUser));
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const persistSession = (token, userData) => {
    localStorage.setItem('mediq_token', token);
    localStorage.setItem('mediq_user', JSON.stringify(userData));
    setUser(userData);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth — Convenience hook to access the auth context.
 * Throws if used outside an AuthProvider.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
