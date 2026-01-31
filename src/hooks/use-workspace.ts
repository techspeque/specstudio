'use client';

// ============================================================================
// Workspace Hook
// Manages specs, spec content, and console output
// Uses Tauri IPC via invoke()
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Spec, StreamEvent, DevelopmentPlan } from '@/types';

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
  createSpec: (title: string) => Promise<void>;
  deleteSpec: (filename: string) => Promise<void>;
  developmentPlan: DevelopmentPlan | null;
  setDevelopmentPlan: (plan: DevelopmentPlan | null | ((prev: DevelopmentPlan | null) => DevelopmentPlan | null)) => void;
  savePlan: (filename: string, planData: DevelopmentPlan) => Promise<void>;
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
  const [developmentPlan, setDevelopmentPlanState] = useState<DevelopmentPlan | null>(null);
  const [consoleOutput, setConsoleOutput] = useState<StreamEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workingDirectory, setWorkingDirectory] = useState<string>('');

  // Track if spec has been modified since last save
  const specModifiedRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentFilenameRef = useRef<string | null>(null);
  const planAutoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
   * Select a spec and load its content (and companion plan if exists)
   */
  const selectSpec = useCallback(async (spec: Spec | null) => {
    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (planAutoSaveTimeoutRef.current) {
      clearTimeout(planAutoSaveTimeoutRef.current);
    }

    setSelectedSpec(spec);
    currentFilenameRef.current = spec?.filename ?? null;

    if (!spec || !targetWorkspace) {
      setSpecContentState('');
      setDevelopmentPlanState(null);
      specModifiedRef.current = false;
      return;
    }

    try {
      setIsLoading(true);

      // Load spec content
      const result = await invoke<SpecContent>('read_spec', {
        filename: spec.filename,
        workingDirectory: targetWorkspace,
      });
      setSpecContentState(result.content);
      specModifiedRef.current = false;

      // Try to load companion plan file
      try {
        const planFilename = spec.filename.replace('.md', '.plan.json');
        const planResult = await invoke<SpecContent>('read_spec', {
          filename: planFilename,
          workingDirectory: targetWorkspace,
        });
        const plan = JSON.parse(planResult.content) as DevelopmentPlan;
        setDevelopmentPlanState(plan);
      } catch {
        // No plan file exists or parse error - that's ok
        setDevelopmentPlanState(null);
      }
    } catch (err) {
      setError(err as string);
      setSpecContentState('');
      setDevelopmentPlanState(null);
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
   * Create a new spec file with default template
   */
  const createSpec = useCallback(async (title: string) => {
    if (!targetWorkspace) {
      throw new Error('No workspace selected');
    }

    try {
      setIsSaving(true);
      setError(null);

      // Generate versioned filename (YYYYMMDD-slug.md)
      const now = new Date();
      const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '');
      const slugifiedTitle = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
      const filename = `${datePrefix}-${slugifiedTitle || 'untitled'}.md`;

      // Default markdown template
      const defaultContent = `# ${title}

## Overview
Describe the feature or component being built.

## Requirements
- Requirement 1
- Requirement 2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Technical Notes
Add implementation details, constraints, or architectural decisions.
`;

      // Save the new spec
      await invoke<SaveResult>('save_spec', {
        filename,
        content: defaultContent,
        workingDirectory: targetWorkspace,
      });

      // Refresh workspace to pick up the new spec
      await refreshWorkspace();

      // Find and select the newly created spec
      const updatedSpecs = await invoke<WorkspaceData>('read_workspace', {
        workingDirectory: targetWorkspace,
      });

      const newSpec = updatedSpecs.specs.find(s => s.filename === filename);
      if (newSpec) {
        await selectSpec(newSpec);
      }
    } catch (err) {
      setError(err as string);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [targetWorkspace, refreshWorkspace, selectSpec]);

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

  /**
   * Save a plan file to docs/specs/{filename}.plan.json
   */
  const savePlan = useCallback(async (filename: string, planData: DevelopmentPlan) => {
    if (!targetWorkspace) {
      throw new Error('No workspace selected');
    }

    try {
      setIsSaving(true);
      setError(null);

      const planFilename = filename.replace('.md', '.plan.json');
      await invoke<SaveResult>('save_spec', {
        filename: planFilename,
        content: JSON.stringify(planData, null, 2),
        workingDirectory: targetWorkspace,
      });
    } catch (err) {
      setError(err as string);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [targetWorkspace]);

  /**
   * Set development plan with auto-save support
   * Supports both direct values and function updaters
   */
  const setDevelopmentPlan = useCallback((planOrUpdater: DevelopmentPlan | null | ((prev: DevelopmentPlan | null) => DevelopmentPlan | null)) => {
    // Handle both direct values and function updaters
    setDevelopmentPlanState((prev) => {
      const newPlan = typeof planOrUpdater === 'function' ? planOrUpdater(prev) : planOrUpdater;

      // Trigger auto-save after state update
      if (newPlan && currentFilenameRef.current && targetWorkspace) {
        // Clear existing timeout
        if (planAutoSaveTimeoutRef.current) {
          clearTimeout(planAutoSaveTimeoutRef.current);
        }

        // Auto-save after 1 second of inactivity
        const filename = currentFilenameRef.current;
        planAutoSaveTimeoutRef.current = setTimeout(async () => {
          try {
            const planFilename = filename.replace('.md', '.plan.json');
            await invoke<SaveResult>('save_spec', {
              filename: planFilename,
              content: JSON.stringify(newPlan, null, 2),
              workingDirectory: targetWorkspace,
            });
          } catch {
            // Silently fail auto-save
          }
        }, 1000);
      }

      return newPlan;
    });
  }, [targetWorkspace]);

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

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (planAutoSaveTimeoutRef.current) {
        clearTimeout(planAutoSaveTimeoutRef.current);
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
    createSpec,
    deleteSpec,
    developmentPlan,
    setDevelopmentPlan,
    savePlan,
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
