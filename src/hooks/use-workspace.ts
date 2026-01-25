'use client';

// ============================================================================
// Workspace Hook
// Manages ADRs, spec content, and console output
// Uses Tauri IPC via invoke()
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ADR, StreamEvent } from '@/types';

interface WorkspaceData {
  specContent: string;
  adrs: ADR[];
  workingDirectory: string;
}

interface SaveResult {
  success: boolean;
}

interface UseWorkspaceReturn {
  adrs: ADR[];
  selectedAdr: ADR | null;
  selectAdr: (adr: ADR | null) => void;
  specContent: string;
  setSpecContent: (content: string) => void;
  saveSpec: () => Promise<void>;
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
  const [adrs, setAdrs] = useState<ADR[]>([]);
  const [selectedAdr, setSelectedAdr] = useState<ADR | null>(null);
  const [specContent, setSpecContentState] = useState<string>('');
  const [consoleOutput, setConsoleOutput] = useState<StreamEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workingDirectory, setWorkingDirectory] = useState<string>('');

  // Track if spec has been modified since last save
  const specModifiedRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetch workspace data (spec.md and ADRs) via Tauri invoke
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

      setSpecContentState(data.specContent);
      setAdrs(data.adrs);
      setWorkingDirectory(data.workingDirectory);
      specModifiedRef.current = false;
    } catch (err) {
      setError(err as string);
    } finally {
      setIsLoading(false);
    }
  }, [targetWorkspace]);

  /**
   * Save spec content to the filesystem via Tauri invoke
   */
  const saveSpec = useCallback(async () => {
    if (!specModifiedRef.current || !targetWorkspace) return;

    try {
      setIsSaving(true);
      setError(null);

      await invoke<SaveResult>('save_workspace', {
        specContent,
        workingDirectory: workingDirectory || targetWorkspace,
      });

      specModifiedRef.current = false;
    } catch (err) {
      setError(err as string);
    } finally {
      setIsSaving(false);
    }
  }, [specContent, workingDirectory, targetWorkspace]);

  /**
   * Set spec content and mark as modified
   * Auto-saves after a debounce period
   */
  const setSpecContent = useCallback((content: string) => {
    setSpecContentState(content);
    specModifiedRef.current = true;

    // No workspace - don't auto-save
    if (!targetWorkspace) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Auto-save after 2 seconds of inactivity
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await invoke<SaveResult>('save_workspace', {
          specContent: content,
          workingDirectory: targetWorkspace,
        });
        specModifiedRef.current = false;
      } catch {
        // Silently fail auto-save, user can manually save
      }
    }, 2000);
  }, [targetWorkspace]);

  const selectAdr = useCallback((adr: ADR | null) => {
    setSelectedAdr(adr);
  }, []);

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
      setAdrs([]);
      setSelectedAdr(null);
      setSpecContentState('');
      setWorkingDirectory('');
      setError(null);
      setIsLoading(false);
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
    adrs,
    selectedAdr,
    selectAdr,
    specContent,
    setSpecContent,
    saveSpec,
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
