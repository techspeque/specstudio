'use client';

// ============================================================================
// IDE Entry Point
// Handles auth gating and renders the main IDE
// ============================================================================

import { useAuth } from '@/hooks/use-auth';
import { useWorkspaceTarget } from '@/hooks/use-workspace-target';
import { AuthSplash } from '@/components/auth/auth-splash';
import { IdeLayout } from './ide-layout';
import { Loader2 } from 'lucide-react';

export function Ide() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
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

  // Show loading state on initial auth check or workspace init
  if (isAuthLoading || !isInitialized) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>{isAuthLoading ? 'Checking authentication...' : 'Loading...'}</span>
        </div>
      </div>
    );
  }

  // Show auth splash if not fully authenticated
  if (!isAuthenticated) {
    return <AuthSplash />;
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
