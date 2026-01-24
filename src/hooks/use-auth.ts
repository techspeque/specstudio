'use client';

// ============================================================================
// Auth Hook
// Manages authentication state for Google and Anthropic
// Uses Electron IPC when available, falls back to fetch for web/dev mode
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { AuthStatus, AuthProvider } from '@/types';

interface UseAuthReturn {
  status: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (provider: AuthProvider) => Promise<void>;
  checkAuth: () => Promise<void>;
  error: string | null;
}

/**
 * Check if running in Electron environment
 */
function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.platform?.isElectron === true;
}

export function useAuth(): UseAuthReturn {
  const [status, setStatus] = useState<AuthStatus>({
    google: false,
    anthropic: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let data: AuthStatus;

      if (isElectron()) {
        // Use Electron IPC
        data = await window.electron!.auth.check();
      } else {
        // Fall back to fetch for web/dev mode
        const response = await fetch('/api/auth');
        if (!response.ok) {
          throw new Error('Failed to check auth status');
        }
        data = await response.json();
      }

      setStatus(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (provider: AuthProvider) => {
    try {
      setIsLoading(true);
      setError(null);

      if (isElectron()) {
        // Use Electron IPC
        const result = await window.electron!.auth.login(provider);
        if (!result.success) {
          throw new Error(result.message);
        }
      } else {
        // Fall back to fetch for web/dev mode
        const response = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider }),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.message);
        }
      }

      // Refresh auth status after login
      await checkAuth();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [checkAuth]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const isAuthenticated = status.google && status.anthropic;

  return {
    status,
    isLoading,
    isAuthenticated,
    login,
    checkAuth,
    error,
  };
}
