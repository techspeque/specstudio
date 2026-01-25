'use client';

// ============================================================================
// Auth Hook
// Manages authentication state for Google and Anthropic
// Uses browser-based OAuth flow via Tauri backend
// OAuth credentials are bundled at build time - users just click "Login"
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { AuthStatus, AuthProvider } from '@/types';

interface UseAuthReturn {
  status: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (provider: AuthProvider) => Promise<void>;
  logout: (provider: AuthProvider) => Promise<void>;
  checkAuth: () => Promise<void>;
  error: string | null;
}

interface AuthEvent {
  provider: string;
  status: string;
  message: string;
}

interface AuthStatusResponse {
  google: boolean;
  anthropic: boolean;
}

export function useAuth(): UseAuthReturn {
  const [status, setStatus] = useState<AuthStatus>({
    google: false,
    anthropic: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const authStatus = await invoke<AuthStatusResponse>('check_all_auth');
      setStatus({
        google: authStatus.google,
        anthropic: authStatus.anthropic,
      });
    } catch (err) {
      console.error('Failed to check auth status:', err);
      setError((err as Error).message || 'Failed to check authentication status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (provider: AuthProvider) => {
    setIsLoading(true);
    setError(null);

    try {
      const command = provider === 'google' ? 'start_google_oauth' : 'start_anthropic_oauth';
      const result = await invoke<{ success: boolean; message: string }>(command);

      if (result.success) {
        setStatus(prev => ({
          ...prev,
          [provider]: true,
        }));
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      const message = (err as Error).message || 'Authentication failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (provider: AuthProvider) => {
    setIsLoading(true);
    setError(null);

    try {
      const command = provider === 'google' ? 'logout_google' : 'logout_anthropic';
      await invoke(command);
      setStatus(prev => ({
        ...prev,
        [provider]: false,
      }));
    } catch (err) {
      setError((err as Error).message || 'Logout failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Listen for auth status events from backend
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<AuthEvent>('auth:status', (event) => {
        const { provider, status: authStatus, message } = event.payload;

        if (authStatus === 'authenticated') {
          setStatus(prev => ({
            ...prev,
            [provider]: true,
          }));
          setIsLoading(false);
        } else if (authStatus === 'logged_out') {
          setStatus(prev => ({
            ...prev,
            [provider]: false,
          }));
        } else if (authStatus === 'error') {
          setError(message);
          setIsLoading(false);
        } else if (authStatus === 'pending') {
          setIsLoading(true);
        }
      });
    };

    setupListener();

    return () => {
      unlisten?.();
    };
  }, []);

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // User is authenticated if either provider is authenticated
  const isAuthenticated = status.google || status.anthropic;

  return {
    status,
    isLoading,
    isAuthenticated,
    login,
    logout,
    checkAuth,
    error,
  };
}
