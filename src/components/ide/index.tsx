'use client';

// ============================================================================
// IDE Entry Point
// Handles setup wizard and renders the main IDE
// ============================================================================

import { useState, useCallback } from 'react';
import { useWorkspaceTarget } from '@/hooks/use-workspace-target';
import { SetupWizard } from '@/components/setup/setup-wizard';
import { IdeLayout } from './ide-layout';
import { Loader2 } from 'lucide-react';

export function Ide() {
  // Setup wizard handles checking API key and Claude CLI
  // It will auto-skip if everything is already configured
  const [setupComplete, setSetupComplete] = useState(false);

  const {
    activeWorkspace,
    workspaces,
    selectWorkspace,
    addWorkspace,
    removeWorkspace,
    clearActiveWorkspace,
    browseForFolder,
    isValidating,
    validationError,
    hasTourCompleted,
    completeTour,
    isInitialized,
  } = useWorkspaceTarget();

  const handleSetupComplete = useCallback(() => {
    setSetupComplete(true);
  }, []);

  // Show setup wizard first - it will auto-skip if already configured
  if (!setupComplete) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  // Show loading state during workspace init
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Render the IDE - handles both with and without workspace
  return (
    <IdeLayout
      activeWorkspace={activeWorkspace}
      workspaces={workspaces}
      onSelectWorkspace={selectWorkspace}
      onAddWorkspace={addWorkspace}
      onRemoveWorkspace={removeWorkspace}
      onChangeWorkspace={clearActiveWorkspace}
      onBrowseFolder={browseForFolder}
      isValidating={isValidating}
      validationError={validationError}
      showTour={!hasTourCompleted && activeWorkspace !== null}
      onTourComplete={completeTour}
    />
  );
}
