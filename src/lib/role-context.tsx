'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'admin' | 'consumer' | 'viewer';

export interface AuthUser {
  id?: number | string;
  email: string;
  name?: string;
  role: 'admin' | 'consumer';
  accountId?: string;
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
  logout: () => void;
  logoutAdmin: () => void;
  setRoleDirectly: (role: UserRole, user?: AuthUser | null) => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>('viewer');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    try {
      const savedRole = localStorage.getItem('dsm_user_role') as UserRole | null;
      const savedUser = localStorage.getItem('dsm_auth_user') || localStorage.getItem('dsm_admin_user');
      if (savedRole === 'admin' || savedRole === 'consumer' || savedRole === 'viewer') {
        setRole(savedRole);
      }
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch {
      // LocalStorage access fail safe
    } finally {
      setIsInitialized(true);
    }
  }, []);

  const setRoleDirectly = (newRole: UserRole, newUser?: AuthUser | null) => {
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
    } catch {}
  };

  const login = async (
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
        setRoleDirectly(detectedRole, data.user);
        setShowAuthModal(false);
        return { success: true, role: detectedRole };
      }
      return { success: false, error: data.error || 'Invalid credentials' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Authentication error' };
    }
  };

  const loginAsAdmin = async (email: string, password: string) => {
    return login(email, password);
  };

  const logout = () => {
    setRoleDirectly('viewer', null);
  };

  const logoutAdmin = () => {
    logout();
  };

  return (
    <RoleContext.Provider
      value={{
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
        setRoleDirectly,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
