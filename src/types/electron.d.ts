// ============================================================================
// Electron API Type Definitions
// Types for the window.electron context bridge API
// ============================================================================

import { AuthProvider, AuthResponse, AuthStatus, ADR, StreamEvent, RpcAction, RpcResponse } from './index';

export interface WorkspaceValidation {
  valid: boolean;
  path?: string;
  error?: string;
  created?: boolean;
}

export interface WorkspaceData {
  specContent: string;
  adrs: ADR[];
  workingDirectory: string;
}

export interface BrowseResult {
  canceled: boolean;
  path?: string;
}

export interface SettingsData {
  gcpProjectId: string;
}

export interface SettingsResponse {
  success: boolean;
  error?: string;
}

export interface ElectronAPI {
  auth: {
    check: () => Promise<AuthStatus>;
    login: (provider: AuthProvider) => Promise<AuthResponse>;
  };

  workspace: {
    validate: (path: string) => Promise<WorkspaceValidation>;
    read: (workingDirectory: string) => Promise<WorkspaceData>;
    save: (data: { specContent: string; workingDirectory: string }) => Promise<{ success: boolean }>;
    browse: () => Promise<BrowseResult>;
  };

  rpc: {
    execute: (action: RpcAction, payload: Record<string, unknown>) => Promise<RpcResponse>;
    stream: (action: RpcAction, payload: Record<string, unknown>) => Promise<{ started: boolean }>;
    cancel: () => Promise<{ success: boolean }>;
    onStreamData: (callback: (data: StreamEvent) => void) => () => void;
  };

  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<SettingsResponse>;
    getAll: () => Promise<SettingsData>;
  };

  platform: {
    get: () => NodeJS.Platform;
    isElectron: boolean;
  };
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
