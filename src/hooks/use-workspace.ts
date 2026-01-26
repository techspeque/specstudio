'use client';

// ============================================================================
// Workspace Hook
// Manages specs, spec content, and console output
// Uses Tauri IPC via invoke()
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Spec, StreamEvent } from '@/types';

interface WorkspaceData {
  specs: Spec[];
  workingDirectory: string;
}

interface SpecContent {
  filename: string;
  content: string;
}

interface SaveResult {
  success: boolean;
}

interface UseWorkspaceReturn {
  specs: Spec[];
  selectedSpec: Spec | null;
  selectSpec: (spec: Spec | null) => void;
  specContent: string;
  setSpecContent: (content: string) => void;
  saveSpec: (filename: string, content: string) => Promise<void>;
  deleteSpec: (filename: string) => Promise<void>;
  consoleOutput: StreamEvent[];
  appendConsoleOutput: (event: StreamEvent) => void;
  clearConsole: () => void;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  workingDirectory: string;
  refreshWorkspace: () => Promise<void>;
}

export function useWorkspace(targetWorkspace: string | null): UseWorkspaceReturn {
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [selectedSpec, setSelectedSpec] = useState<Spec | null>(null);
  const [specContent, setSpecContentState] = useState<string>('');
  const [consoleOutput, setConsoleOutput] = useState<StreamEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workingDirectory, setWorkingDirectory] = useState<string>('');

  // Track if spec has been modified since last save
  const specModifiedRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentFilenameRef = useRef<string | null>(null);

  /**
   * Fetch workspace data (list of specs) via Tauri invoke
   */
  const refreshWorkspace = useCallback(async () => {
    // No workspace selected - skip loading
    if (!targetWorkspace) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const data = await invoke<WorkspaceData>('read_workspace', {
        workingDirectory: targetWorkspace,
      });

      setSpecs(data.specs);
      setWorkingDirectory(data.workingDirectory);
    } catch (err) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  }, [targetWorkspace]);

  /**
   * Select a spec and load its content
   */
  const selectSpec = useCallback(async (spec: Spec | null) => {
    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSelectedSpec(spec);
    currentFilenameRef.current = spec?.filename ?? null;

    if (!spec || !targetWorkspace) {
      setSpecContentState('');
      specModifiedRef.current = false;
      return;
    }

    try {
      setIsLoading(true);
      const result = await invoke<SpecContent>('read_spec', {
        filename: spec.filename,
        workingDirectory: targetWorkspace,
      });
      setSpecContentState(result.content);
      specModifiedRef.current = false;
    } catch (err) {
      setError(err as string);
      setSpecContentState('');
    } finally {
      setIsLoading(false);
    }
  }, [targetWorkspace]);

  /**
   * Save a spec file to docs/specs/
   */
  const saveSpec = useCallback(async (filename: string, content: string) => {
    if (!targetWorkspace) {
      throw new Error('No workspace selected');
    }

    try {
      setIsSaving(true);
      setError(null);

      await invoke<SaveResult>('save_spec', {
        filename,
        content,
        workingDirectory: targetWorkspace,
      });

      specModifiedRef.current = false;

      // Refresh workspace to pick up the new/updated spec
      await refreshWorkspace();
    } catch (err) {
      setError(err as string);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [targetWorkspace, refreshWorkspace]);

  /**
   * Delete a spec file
   */
  const deleteSpec = useCallback(async (filename: string) => {
    if (!targetWorkspace) {
      throw new Error('No workspace selected');
    }

    try {
      setIsSaving(true);
      setError(null);

      await invoke<SaveResult>('delete_spec', {
        filename,
        workingDirectory: targetWorkspace,
      });

      // If the deleted spec was selected, clear selection
      if (selectedSpec?.filename === filename) {
        setSelectedSpec(null);
        setSpecContentState('');
        currentFilenameRef.current = null;
      }

      // Refresh workspace to update the list
      await refreshWorkspace();
    } catch (err) {
      setError(err as string);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [targetWorkspace, selectedSpec, refreshWorkspace]);

  /**
   * Set spec content and mark as modified
   * Auto-saves after a debounce period if a spec is selected
   */
  const setSpecContent = useCallback((content: string) => {
    setSpecContentState(content);
    specModifiedRef.current = true;

    // No workspace or no selected spec - don't auto-save
    if (!targetWorkspace || !currentFilenameRef.current) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Auto-save after 2 seconds of inactivity
    const filename = currentFilenameRef.current;
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await invoke<SaveResult>('save_spec', {
          filename,
          content,
          workingDirectory: targetWorkspace,
        });
        specModifiedRef.current = false;
      } catch {
        // Silently fail auto-save, user can manually save
      }
    }, 2000);
  }, [targetWorkspace]);

  const appendConsoleOutput = useCallback((event: StreamEvent) => {
    setConsoleOutput((prev) => [...prev, event]);
  }, []);

  const clearConsole = useCallback(() => {
    setConsoleOutput([]);
  }, []);

  // Load workspace data on mount or when workspace changes
  useEffect(() => {
    if (targetWorkspace) {
      refreshWorkspace();
    } else {
      // Reset state when no workspace
      setSpecs([]);
      setSelectedSpec(null);
      setSpecContentState('');
      setWorkingDirectory('');
      setError(null);
      setIsLoading(false);
      currentFilenameRef.current = null;
    }
  }, [targetWorkspace, refreshWorkspace]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    specs,
    selectedSpec,
    selectSpec,
    specContent,
    setSpecContent,
    saveSpec,
    deleteSpec,
    consoleOutput,
    appendConsoleOutput,
    clearConsole,
    isLoading,
    isSaving,
    error,
    workingDirectory,
    refreshWorkspace,
  };
}
