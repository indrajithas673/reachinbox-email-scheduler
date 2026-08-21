import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';
import { fetchApi, ApiError } from '../services/apiClient';

interface AuthContextType {
  user: User | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  handleApiError: (error: any) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const data = await fetchApi<User>('/auth/me');
      setUser(data);
      setStatus('authenticated');
    } catch (err) {
      setUser(null);
      setStatus('unauthenticated');
    }
  };

  const loginWithGoogle = () => {
    window.location.href = '/api/auth/google';
  };

  const logout = async () => {
    try {
      await fetchApi('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  };

  const handleApiError = (error: any) => {
    if (error instanceof ApiError && error.status === 401) {
      setUser(null);
      setStatus('unauthenticated');
    }
  };

  return (
    <AuthContext.Provider value={{ user, status, loginWithGoogle, logout, handleApiError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
