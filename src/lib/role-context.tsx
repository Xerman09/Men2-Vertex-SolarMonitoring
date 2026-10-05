'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

export type UserRole = 'admin' | 'consumer' | 'viewer';

export interface AuthUser {
  id?: number | string;
  email: string;
  name?: string;
  role: 'admin' | 'consumer';
  accountId?: string;
  stationId?: string;
}

export type AdminUser = AuthUser;

interface RoleContextType {
  role: UserRole;
  isAdmin: boolean;
  isConsumer: boolean;
  isViewer: boolean;
  isInitialized: boolean;
  user: AuthUser | null;
  adminUser: AuthUser | null; // Backward compatibility alias
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; role?: UserRole; error?: string }>;
  loginAsAdmin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  logoutAdmin: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>('viewer');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Synchronize initial session state from server cookie (server-authoritative)
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            if (data.authenticated && data.user) {
              setRole(data.role);
              setUser(data.user);
              try {
                localStorage.setItem('dsm_user_role', data.role);
                localStorage.setItem('dsm_auth_user', JSON.stringify(data.user));
              } catch {
                // Ignore storage errors
              }
            } else {
              // Server explicitly reports unauthenticated: purge cached hints
              setRole('viewer');
              setUser(null);
              try {
                localStorage.removeItem('dsm_user_role');
                localStorage.removeItem('dsm_auth_user');
                localStorage.removeItem('dsm_admin_user');
              } catch {
                // Ignore storage errors
              }
            }
          }
          return;
        }

        // Only on non-200 network error (e.g. offline gateway), use localStorage as read-only UX hint
        const savedRole = localStorage.getItem('dsm_user_role') as UserRole | null;
        const savedUser = localStorage.getItem('dsm_auth_user') || localStorage.getItem('dsm_admin_user');
        if (mounted) {
          if (savedRole === 'admin' || savedRole === 'consumer' || savedRole === 'viewer') {
            setRole(savedRole);
          }
          if (savedUser) {
            try {
              setUser(JSON.parse(savedUser));
            } catch {}
          }
        }
      } catch (err) {
        console.warn('[RoleProvider] Offline session check fallback:', err);
      } finally {
        if (mounted) {
          setIsInitialized(true);
        }
      }
    }

    initSession();

    // Revalidate session on window focus
    const handleFocus = () => {
      initSession();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      mounted = false;
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const applyRoleState = useCallback((newRole: UserRole, newUser?: AuthUser | null) => {
    setRole(newRole);
    try {
      localStorage.setItem('dsm_user_role', newRole);
      if (newUser) {
        setUser(newUser);
        localStorage.setItem('dsm_auth_user', JSON.stringify(newUser));
      } else {
        setUser(null);
        localStorage.removeItem('dsm_auth_user');
        localStorage.removeItem('dsm_admin_user');
      }
    } catch {
      // LocalStorage access fail safe
    }
  }, []);

  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ success: boolean; role?: UserRole; error?: string }> => {
      try {
        const res = await fetch('/api/auth/role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const detectedRole: UserRole = data.role === 'admin' ? 'admin' : 'consumer';
          applyRoleState(detectedRole, data.user);
          setShowAuthModal(false);
          return { success: true, role: detectedRole };
        }
        return { success: false, error: data.error || 'Invalid credentials' };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Authentication service error';
        return { success: false, error: msg };
      }
    },
    [applyRoleState]
  );

  const loginAsAdmin = useCallback(
    async (email: string, password: string) => {
      return login(email, password);
    },
    [login]
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/session', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    applyRoleState('viewer', null);
  }, [applyRoleState]);

  const logoutAdmin = useCallback(async () => {
    await logout();
  }, [logout]);

  const contextValue = useMemo<RoleContextType>(
    () => ({
      role,
      isAdmin: role === 'admin',
      isConsumer: role === 'consumer',
      isViewer: role === 'viewer',
      isInitialized,
      user,
      adminUser: user,
      showAuthModal,
      setShowAuthModal,
      login,
      loginAsAdmin,
      logout,
      logoutAdmin,
    }),
    [
      role,
      isInitialized,
      user,
      showAuthModal,
      login,
      loginAsAdmin,
      logout,
      logoutAdmin,
    ]
  );

  return <RoleContext.Provider value={contextValue}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
