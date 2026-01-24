'use client';

// ============================================================================
// Workspace Target Hook
// Manages multiple workspaces with selection, creation, and persistence
// Uses Electron IPC when available, falls back to fetch for web/dev mode
// ============================================================================

import { useState, useCallback, useEffect } from 'react';

const WORKSPACES_KEY = 'specstudio_workspaces';
const ACTIVE_WORKSPACE_KEY = 'specstudio_active_workspace';
const TOUR_COMPLETED_PREFIX = 'specstudio_tour_completed_';

export interface Workspace {
  path: string;
  name: string;
  lastAccessed: number;
}

interface UseWorkspaceTargetReturn {
  // Current workspace
  activeWorkspace: Workspace | null;
  // All saved workspaces
  workspaces: Workspace[];
  // Select an existing workspace
  selectWorkspace: (workspace: Workspace) => void;
  // Add and select a new workspace
  addWorkspace: (path: string) => Promise<{ success: boolean; error?: string }>;
  // Remove a workspace from the list
  removeWorkspace: (path: string) => void;
  // Clear active workspace (go back to selection)
  clearActiveWorkspace: () => void;
  // Validation state
  isValidating: boolean;
  validationError: string | null;
  // Tour state
  hasTourCompleted: boolean;
  completeTour: () => void;
  // Loading state
  isInitialized: boolean;
  // Native folder picker (Electron only)
  browseForFolder: () => Promise<string | null>;
}

/**
 * Check if running in Electron environment
 */
function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.platform?.isElectron === true;
}

export function useWorkspaceTarget(): UseWorkspaceTargetReturn {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasTourCompleted, setHasTourCompleted] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Load workspaces list
      const storedWorkspaces = localStorage.getItem(WORKSPACES_KEY);
      if (storedWorkspaces) {
        try {
          const parsed = JSON.parse(storedWorkspaces) as Workspace[];
          // Sort by last accessed, most recent first
          parsed.sort((a, b) => b.lastAccessed - a.lastAccessed);
          setWorkspaces(parsed);
        } catch {
          setWorkspaces([]);
        }
      }

      // Load active workspace
      const storedActive = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
      if (storedActive) {
        try {
          const parsed = JSON.parse(storedActive) as Workspace;
          setActiveWorkspace(parsed);

          // Check tour completion for this workspace
          const tourKey = `${TOUR_COMPLETED_PREFIX}${parsed.path}`;
          setHasTourCompleted(localStorage.getItem(tourKey) === 'true');
        } catch {
          setActiveWorkspace(null);
        }
      }

      setIsInitialized(true);
    }
  }, []);

  // Save workspaces to localStorage
  const saveWorkspaces = useCallback((newWorkspaces: Workspace[]) => {
    setWorkspaces(newWorkspaces);
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(newWorkspaces));
  }, []);

  // Select an existing workspace
  const selectWorkspace = useCallback((workspace: Workspace) => {
    // Update last accessed time
    const updatedWorkspace = { ...workspace, lastAccessed: Date.now() };
    setActiveWorkspace(updatedWorkspace);
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(updatedWorkspace));

    // Update in workspaces list
    setWorkspaces(prev => {
      const updated = prev.map(w =>
        w.path === workspace.path ? updatedWorkspace : w
      );
      updated.sort((a, b) => b.lastAccessed - a.lastAccessed);
      localStorage.setItem(WORKSPACES_KEY, JSON.stringify(updated));
      return updated;
    });

    // Check tour completion
    const tourKey = `${TOUR_COMPLETED_PREFIX}${workspace.path}`;
    setHasTourCompleted(localStorage.getItem(tourKey) === 'true');
    setValidationError(null);
  }, []);

  // Add a new workspace
  const addWorkspace = useCallback(async (path: string): Promise<{ success: boolean; error?: string }> => {
    setIsValidating(true);
    setValidationError(null);

    try {
      let data: { valid: boolean; path?: string; error?: string; created?: boolean };

      if (isElectron()) {
        // Use Electron IPC
        data = await window.electron!.workspace.validate(path);
      } else {
        // Fall back to fetch for web/dev mode
        const response = await fetch('/api/workspace/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });

        data = await response.json();
      }

      if (!data.valid) {
        const error = data.error || 'Invalid workspace path';
        setValidationError(error);
        return { success: false, error };
      }

      // Extract name from path
      const name = path.split('/').filter(Boolean).pop() || path;

      const newWorkspace: Workspace = {
        path: data.path || path,
        name,
        lastAccessed: Date.now(),
      };

      // Check if already exists
      const existingIndex = workspaces.findIndex(w => w.path === newWorkspace.path);

      let updatedWorkspaces: Workspace[];
      if (existingIndex >= 0) {
        // Update existing
        updatedWorkspaces = [...workspaces];
        updatedWorkspaces[existingIndex] = newWorkspace;
      } else {
        // Add new
        updatedWorkspaces = [newWorkspace, ...workspaces];
      }

      updatedWorkspaces.sort((a, b) => b.lastAccessed - a.lastAccessed);
      saveWorkspaces(updatedWorkspaces);

      // Set as active
      setActiveWorkspace(newWorkspace);
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(newWorkspace));

      // New workspace = show tour
      const tourKey = `${TOUR_COMPLETED_PREFIX}${newWorkspace.path}`;
      const tourCompleted = localStorage.getItem(tourKey) === 'true';
      setHasTourCompleted(tourCompleted);

      return { success: true };
    } catch (error) {
      const errorMsg = (error as Error).message;
      setValidationError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsValidating(false);
    }
  }, [workspaces, saveWorkspaces]);

  // Remove a workspace
  const removeWorkspace = useCallback((path: string) => {
    const updatedWorkspaces = workspaces.filter(w => w.path !== path);
    saveWorkspaces(updatedWorkspaces);

    // If removing active workspace, clear it
    if (activeWorkspace?.path === path) {
      setActiveWorkspace(null);
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    }
  }, [workspaces, activeWorkspace, saveWorkspaces]);

  // Clear active workspace
  const clearActiveWorkspace = useCallback(() => {
    setActiveWorkspace(null);
    localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    setValidationError(null);
  }, []);

  // Complete tour
  const completeTour = useCallback(() => {
    setHasTourCompleted(true);
    if (activeWorkspace) {
      const tourKey = `${TOUR_COMPLETED_PREFIX}${activeWorkspace.path}`;
      localStorage.setItem(tourKey, 'true');
    }
  }, [activeWorkspace]);

  // Browse for folder using native OS dialog (Electron only)
  const browseForFolder = useCallback(async (): Promise<string | null> => {
    if (!isElectron()) {
      return null;
    }

    const result = await window.electron!.workspace.browse();
    if (result.canceled || !result.path) {
      return null;
    }

    return result.path;
  }, []);

  return {
    activeWorkspace,
    workspaces,
    selectWorkspace,
    addWorkspace,
    removeWorkspace,
    clearActiveWorkspace,
    isValidating,
    validationError,
    hasTourCompleted,
    completeTour,
    isInitialized,
    browseForFolder,
  };
}
