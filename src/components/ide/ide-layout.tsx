'use client';

// ============================================================================
// IDE Layout
// Main IDE component with split panels
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useChat, useRpc } from '@/hooks/use-rpc';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useWorkspace } from '@/hooks/use-workspace';
import { Workspace } from '@/hooks/use-workspace-target';
import { RpcAction, StreamEvent } from '@/types';
import { SpecSidebar } from './spec-sidebar';
import { ControlBar } from './control-bar';
import { OutputConsole } from './output-console';
import { IdeTour } from './ide-tour';
import { FileExplorer } from './file-explorer';
import { DiffViewer } from './diff-viewer';
import { ActiveSpecIndicator } from './active-spec-indicator';
import { SpecEditor } from '@/components/workspace/spec-editor';
import { ChatPanel } from '@/components/workspace/chat-panel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Terminal,
  Loader2,
  FolderOpen,
  ChevronDown,
  Plus,
  Check,
  LogOut,
  FolderPlus,
  Clock,
  Trash2,
  AlertCircle,
  Sparkles,
  FolderSearch,
  Settings,
  FileText,
  AlertTriangle,
  FolderTree,
} from 'lucide-react';
import { SettingsDialog, useSettingsCheck } from './settings-dialog';

interface IdeLayoutProps {
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  onSelectWorkspace: (workspace: Workspace) => void;
  onAddWorkspace: (path: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveWorkspace: (path: string) => void;
  onChangeWorkspace: () => void;
  onBrowseFolder: () => Promise<string | null>;
  isValidating: boolean;
  validationError: string | null;
  showTour: boolean;
  onTourComplete: () => void;
}

export function IdeLayout({
  activeWorkspace,
  workspaces,
  onSelectWorkspace,
  onAddWorkspace,
  onRemoveWorkspace,
  onChangeWorkspace,
  onBrowseFolder,
  isValidating,
  validationError,
  showTour,
  onTourComplete,
}: IdeLayoutProps) {
  const {
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
    isLoading: isWorkspaceLoading,
    isSaving,
    error: workspaceError,
    refreshWorkspace,
  } = useWorkspace(activeWorkspace?.path ?? null);

  const { messages, sendMessage, clearHistory, isLoading: isChatLoading } = useChat();
  const { execute, executeStream, isLoading: isRpcLoading, cancelStream } = useRpc();
  const [loadingAction, setLoadingAction] = useState<RpcAction | null>(null);
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const genSpecUnlistenRef = useRef<UnlistenFn | null>(null);
  const genSpecContentRef = useRef<string>('');
  const genSpecFilenameRef = useRef<string>('');
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isAddingWorkspace, setIsAddingWorkspace] = useState(false);
  const [newWorkspacePath, setNewWorkspacePath] = useState('');
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [hasGitChanges, setHasGitChanges] = useState(false);
  const [showRevertButton, setShowRevertButton] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [showFileExplorer, setShowFileExplorer] = useState(false);
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);

  // Check if settings are configured (GCP Project ID)
  const { isConfigured, isChecking, recheckSettings } = useSettingsCheck();

  // Auto-open settings dialog if GCP Project ID is missing
  useEffect(() => {
    if (!isChecking && isConfigured === false && activeWorkspace) {
      setIsSettingsDialogOpen(true);
    }
  }, [isChecking, isConfigured, activeWorkspace]);

  // Cleanup gen_spec listener on unmount
  useEffect(() => {
    return () => {
      if (genSpecUnlistenRef.current) {
        genSpecUnlistenRef.current();
      }
    };
  }, []);

  // Check git status for the current workspace
  const checkGitStatus = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const status = await invoke<{
        isGitRepo: boolean;
        hasChanges: boolean;
        changedFiles: string[];
        untrackedFiles: string[];
      }>('git_status', { workingDirectory: activeWorkspace.path });
      setHasGitChanges(status.hasChanges);
      setChangedFiles([...status.changedFiles, ...status.untrackedFiles]);
    } catch {
      setHasGitChanges(false);
      setChangedFiles([]);
    }
  }, [activeWorkspace]);

  // Handle revert confirmation
  const handleRevertConfirm = useCallback(async () => {
    if (!activeWorkspace) return;
    setIsReverting(true);
    try {
      const result = await invoke<{
        success: boolean;
        message: string;
        revertedFiles: number;
      }>('git_revert_all', { workingDirectory: activeWorkspace.path });

      if (result.success) {
        appendConsoleOutput({
          type: 'output',
          data: result.message,
          timestamp: Date.now(),
        });
        setShowRevertButton(false);
        setHasGitChanges(false);
        refreshWorkspace();
      } else {
        appendConsoleOutput({
          type: 'error',
          data: result.message,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      appendConsoleOutput({
        type: 'error',
        data: `Failed to revert: ${(err as Error).message}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsReverting(false);
      setShowRevertConfirm(false);
    }
  }, [activeWorkspace, appendConsoleOutput, refreshWorkspace]);

  // Generate a versioned filename for new specs (YYYYMMDD-feature-name.md)
  const generateSpecFilename = useCallback((title: string): string => {
    const now = new Date();
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '');
    const slugifiedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    return `${datePrefix}-${slugifiedTitle || 'untitled'}.md`;
  }, []);

  // Handle Gen Spec from chat panel
  const handleGenSpec = useCallback(async () => {
    if (!activeWorkspace || messages.length === 0) return;

    setLoadingAction('gen_spec');
    clearConsole();
    appendConsoleOutput({
      type: 'output',
      data: 'Generating spec from chat history...',
      timestamp: Date.now(),
    });

    // Clear the current spec content and deselect any spec
    selectSpec(null);
    setSpecContent('');
    genSpecContentRef.current = '';

    // Clean up any existing listener
    if (genSpecUnlistenRef.current) {
      genSpecUnlistenRef.current();
      genSpecUnlistenRef.current = null;
    }

    // Construct the synthesis prompt
    const synthesisPrompt = `You are a technical writer. Analyze the preceding conversation and synthesize it into a structured markdown specification.

Output ONLY the specification in the following format (no preamble, no explanation):

# [Feature Title]

## Overview
[Describe the feature or component being built based on the conversation]

## Requirements
- [List key requirements discussed]
- [Include technical and functional requirements]

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Add more criteria as needed]

## Technical Notes
[Include any implementation details, constraints, or architectural decisions from the conversation]

Analyze the conversation and generate a complete specification now.`;

    try {
      // Set up event listener for streaming response
      genSpecUnlistenRef.current = await listen<StreamEvent>('rpc:stream:data', async (event) => {
        const streamEvent = event.payload;

        if (streamEvent.type === 'output') {
          genSpecContentRef.current += streamEvent.data;
          setSpecContent(genSpecContentRef.current);
        } else if (streamEvent.type === 'error') {
          appendConsoleOutput({
            type: 'error',
            data: streamEvent.data,
            timestamp: Date.now(),
          });
        } else if (streamEvent.type === 'complete') {
          // Extract title from the generated spec for filename
          const titleMatch = genSpecContentRef.current.match(/^#\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1].trim() : 'untitled-spec';
          const filename = generateSpecFilename(title);
          genSpecFilenameRef.current = filename;

          try {
            // Save the spec to the file system
            await saveSpec(filename, genSpecContentRef.current);
            appendConsoleOutput({
              type: 'complete',
              data: `Spec saved to docs/specs/${filename}`,
              timestamp: Date.now(),
            });
            // The saveSpec function already refreshes the workspace
          } catch (saveErr) {
            appendConsoleOutput({
              type: 'error',
              data: `Failed to save spec: ${(saveErr as Error).message}`,
              timestamp: Date.now(),
            });
          }

          setLoadingAction(null);
          if (genSpecUnlistenRef.current) {
            genSpecUnlistenRef.current();
            genSpecUnlistenRef.current = null;
          }
        }
      });

      // Call Gemini with the synthesis prompt and chat history
      await invoke('chat_with_gemini', {
        prompt: synthesisPrompt,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        specContent: undefined,
        adrContext: undefined,
      });
    } catch (err) {
      appendConsoleOutput({
        type: 'error',
        data: `Failed to generate spec: ${(err as Error).message}`,
        timestamp: Date.now(),
      });
      setLoadingAction(null);
    }
  }, [activeWorkspace, messages, clearConsole, appendConsoleOutput, selectSpec, setSpecContent, saveSpec, generateSpecFilename]);

  const handleAction = useCallback(
    async (action: RpcAction) => {
      if (!activeWorkspace) return;

      setLoadingAction(action);
      clearConsole();

      // Add initial event
      appendConsoleOutput({
        type: 'output',
        data: `Starting ${action}...`,
        timestamp: Date.now(),
      });

      const payload = {
        specContent,
        workingDirectory: activeWorkspace.path,
      };

      // Use streaming for long-running operations
      if (['create_code', 'gen_tests', 'run_tests', 'run_app'].includes(action)) {
        executeStream(action, payload, (event: StreamEvent) => {
          appendConsoleOutput(event);
          if (event.type === 'complete') {
            setLoadingAction(null);
            // Refresh workspace after code generation to pick up new files
            if (action === 'create_code' || action === 'gen_tests') {
              refreshWorkspace();
              // Show revert button and check git status
              setShowRevertButton(true);
              checkGitStatus();
            }
          }
        });
      } else {
        // Use regular execution for chat/validate
        try {
          const response = await execute(action, payload);
          appendConsoleOutput({
            type: response.success ? 'output' : 'error',
            data: response.data ?? response.error ?? 'No response',
            timestamp: Date.now(),
          });
          appendConsoleOutput({
            type: 'complete',
            data: `${action} completed`,
            timestamp: Date.now(),
          });
        } catch (err) {
          appendConsoleOutput({
            type: 'error',
            data: (err as Error).message,
            timestamp: Date.now(),
          });
        } finally {
          setLoadingAction(null);
        }
      }
    },
    [specContent, activeWorkspace, execute, executeStream, appendConsoleOutput, clearConsole, refreshWorkspace]
  );

  const handleChatMessage = useCallback(
    (content: string) => {
      // Pass working directory and spec content to Gemini
      sendMessage(content, activeWorkspace?.path, specContent);
    },
    [sendMessage, activeWorkspace, specContent]
  );

  const handleDeleteSpec = useCallback(
    async (filename: string) => {
      try {
        await deleteSpec(filename);
        appendConsoleOutput({
          type: 'output',
          data: `Deleted spec: ${filename}`,
          timestamp: Date.now(),
        });
      } catch (err) {
        appendConsoleOutput({
          type: 'error',
          data: `Failed to delete spec: ${(err as Error).message}`,
          timestamp: Date.now(),
        });
      }
    },
    [deleteSpec, appendConsoleOutput]
  );

  const handleCancel = useCallback(() => {
    cancelStream();
    setLoadingAction(null);
    appendConsoleOutput({
      type: 'output',
      data: 'Operation cancelled',
      timestamp: Date.now(),
    });
  }, [cancelStream, appendConsoleOutput]);

  const handleAddNewWorkspace = async () => {
    if (!newWorkspacePath.trim()) return;
    const result = await onAddWorkspace(newWorkspacePath.trim());
    if (result.success) {
      setNewWorkspacePath('');
      setIsAddingWorkspace(false);
    }
  };

  // Show loading state while workspace loads (only if we have an active workspace)
  if (activeWorkspace && isWorkspaceLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
          <p className="text-zinc-500">Loading workspace...</p>
        </div>
      </div>
    );
  }

  // Show error state (only if we have an active workspace)
  if (activeWorkspace && workspaceError) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <p className="text-red-400">Failed to load workspace</p>
          <p className="text-zinc-500 text-sm">{workspaceError}</p>
          <Button
            variant="outline"
            onClick={onChangeWorkspace}
            className="border-zinc-700"
          >
            Change Workspace
          </Button>
        </div>
      </div>
    );
  }

  // No workspace selected - show welcome state
  if (!activeWorkspace) {
    return (
      <div className="h-screen flex flex-col bg-zinc-950">
        {/* Top Bar - Minimal */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-400" />
            <span className="font-semibold text-zinc-200">SpecStudio</span>
          </div>
        </div>

        {/* Welcome Content */}
        <div className="flex-1 overflow-auto">
          <WelcomeState
            workspaces={workspaces}
            onSelectWorkspace={onSelectWorkspace}
            onAddWorkspace={onAddWorkspace}
            onRemoveWorkspace={onRemoveWorkspace}
            onBrowseFolder={onBrowseFolder}
            isValidating={isValidating}
            validationError={validationError}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {/* Interactive Tour */}
      <IdeTour run={showTour} onComplete={onTourComplete} />

      {/* Top Bar with 3-Section Grid Layout */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-2 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
        {/* Left Section - File Explorer Toggle + Workspace Selector */}
        <div id="workspace-indicator" className="flex items-center gap-2">
          <Button
            variant={showFileExplorer ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowFileExplorer(!showFileExplorer)}
            className={showFileExplorer ? 'h-8 w-8 p-0 bg-zinc-700' : 'h-8 w-8 p-0 text-zinc-400 hover:text-zinc-200'}
            title="Toggle File Explorer"
          >
            <FolderTree className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-8 border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              >
                <FolderOpen className="h-4 w-4 mr-2 text-blue-400" />
                <span className="max-w-[200px] truncate font-medium">
                  {activeWorkspace.name}
                </span>
                <ChevronDown className="h-4 w-4 ml-2 text-zinc-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[320px] bg-zinc-900 border-zinc-700"
            >
              <DropdownMenuLabel className="text-zinc-400">
                Workspaces
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-800" />

              {/* Workspace List */}
              {workspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.path}
                  onClick={() => onSelectWorkspace(workspace)}
                  className="cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800"
                >
                  <div className="flex items-center gap-2 w-full">
                    <FolderOpen className="h-4 w-4 text-zinc-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">
                        {workspace.name}
                      </p>
                      <p className="text-xs text-zinc-500 truncate font-mono">
                        {workspace.path}
                      </p>
                    </div>
                    {workspace.path === activeWorkspace.path && (
                      <Check className="h-4 w-4 text-blue-400 shrink-0" />
                    )}
                  </div>
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator className="bg-zinc-800" />

              {/* Add New Workspace */}
              {isAddingWorkspace ? (
                <div className="p-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="/path/to/project"
                      value={newWorkspacePath}
                      onChange={(e) => setNewWorkspacePath(e.target.value)}
                      className="h-8 text-sm bg-zinc-950 border-zinc-700"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddNewWorkspace();
                        if (e.key === 'Escape') {
                          setIsAddingWorkspace(false);
                          setNewWorkspacePath('');
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-8 bg-blue-600 hover:bg-blue-700"
                      onClick={handleAddNewWorkspace}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ) : (
                <DropdownMenuItem
                  onClick={() => setIsAddingWorkspace(true)}
                  className="cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800"
                >
                  <Plus className="h-4 w-4 mr-2 text-zinc-500" />
                  <span className="text-zinc-300">Add Workspace</span>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator className="bg-zinc-800" />

              {/* Manage Workspaces */}
              <DropdownMenuItem
                onClick={onChangeWorkspace}
                className="cursor-pointer hover:bg-zinc-800 focus:bg-zinc-800 text-zinc-400"
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span>Switch Workspace...</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Center Section - Active Spec Indicator */}
        <div className="flex items-center justify-center">
          <ActiveSpecIndicator selectedSpec={selectedSpec} />
        </div>

        {/* Right Section - Control Bar + Settings */}
        <div id="control-bar-actions" className="flex items-center gap-2 justify-end">
          <ControlBar
            onAction={handleAction}
            onManualCommit={() => setIsCommitDialogOpen(true)}
            onRevert={() => setShowRevertConfirm(true)}
            isLoading={isRpcLoading || loadingAction !== null || isReverting}
            loadingAction={loadingAction}
            hasGitChanges={hasGitChanges}
            showRevertButton={showRevertButton}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSettingsDialogOpen(true)}
            className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-200"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content - Using CSS Grid for better Firefox compatibility */}
      <div className={`flex-1 min-h-0 grid overflow-hidden ${showFileExplorer ? 'grid-cols-[200px_250px_1fr]' : 'grid-cols-[250px_1fr]'}`}>
        {/* File Explorer - Only shown when toggled */}
        {showFileExplorer && activeWorkspace && (
          <div className="border-r border-zinc-800 overflow-hidden">
            <FileExplorer
              workingDirectory={activeWorkspace.path}
              changedFiles={changedFiles}
              onSelectFile={(path) => setSelectedDiffFile(path)}
              selectedFile={selectedDiffFile}
            />
          </div>
        )}

        {/* Spec Sidebar - Fixed width */}
        <div id="spec-sidebar" className="border-r border-zinc-800 overflow-hidden">
          <SpecSidebar
            specs={specs}
            selectedSpec={selectedSpec}
            onSelectSpec={selectSpec}
            onDeleteSpec={handleDeleteSpec}
          />
        </div>

        {/* Main Workspace */}
        <div className="grid grid-rows-[1fr_auto] overflow-hidden">
          {/* Editor + Chat Split OR Diff Viewer */}
          {selectedDiffFile ? (
            <div className="min-h-0 overflow-hidden">
              <DiffViewer
                workingDirectory={activeWorkspace?.path ?? ''}
                filePath={selectedDiffFile}
                onClose={() => setSelectedDiffFile(null)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 min-h-0 overflow-hidden">
              {/* Spec Editor */}
              <div id="spec-editor" className="border-r border-zinc-800 overflow-hidden">
                {selectedSpec ? (
                  <SpecEditor content={specContent} onChange={setSpecContent} isSaving={isSaving} />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center bg-zinc-950 text-center p-8">
                    <FileText className="h-12 w-12 text-zinc-700 mb-4" />
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">No Spec Selected</h3>
                    <p className="text-xs text-zinc-600 max-w-xs">
                      Select a spec from the sidebar to edit it, or use the chat to generate a new one.
                    </p>
                  </div>
                )}
              </div>

              {/* Chat Panel */}
              <div id="gemini-chat" className="overflow-hidden">
                <ChatPanel
                  messages={messages}
                  isLoading={isChatLoading}
                  selectedSpec={selectedSpec}
                  specContent={specContent}
                  onSendMessage={handleChatMessage}
                  onClearHistory={clearHistory}
                  onGenSpec={handleGenSpec}
                  isGeneratingSpec={loadingAction === 'gen_spec'}
                />
              </div>
            </div>
          )}

          {/* Output Console */}
          <div id="console-output" className="h-[250px] border-t border-zinc-800 overflow-hidden">
            <OutputConsole
              events={consoleOutput}
              onClear={clearConsole}
              onCancel={loadingAction ? handleCancel : undefined}
              isStreaming={loadingAction !== null}
            />
          </div>
        </div>
      </div>

      {/* Manual Commit Dialog */}
      <ManualCommitDialog
        open={isCommitDialogOpen}
        onOpenChange={setIsCommitDialogOpen}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
        onSettingsSaved={recheckSettings}
      />

      {/* Revert Confirmation Dialog */}
      <Dialog open={showRevertConfirm} onOpenChange={setShowRevertConfirm}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Undo All Changes?
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              This will permanently revert all uncommitted changes in your workspace.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-950/30 border border-red-900/50 rounded-md p-4 text-sm text-red-400">
              <p className="font-medium mb-2">Warning:</p>
              <ul className="list-disc list-inside space-y-1 text-red-400/80">
                <li>All modified files will be reverted to their last committed state</li>
                <li>All new (untracked) files will be deleted</li>
                <li>This cannot be undone</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowRevertConfirm(false)}
                className="border-zinc-700"
                disabled={isReverting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRevertConfirm}
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={isReverting}
              >
                {isReverting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Reverting...
                  </>
                ) : (
                  'Undo All Changes'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Welcome state shown when no workspace is selected
interface WelcomeStateProps {
  workspaces: Workspace[];
  onSelectWorkspace: (workspace: Workspace) => void;
  onAddWorkspace: (path: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveWorkspace: (path: string) => void;
  onBrowseFolder: () => Promise<string | null>;
  isValidating: boolean;
  validationError: string | null;
}

function WelcomeState({
  workspaces,
  onSelectWorkspace,
  onAddWorkspace,
  onRemoveWorkspace,
  onBrowseFolder,
  isValidating,
  validationError,
}: WelcomeStateProps) {
  const [newPath, setNewPath] = useState('');
  const [showForm, setShowForm] = useState(false);
  // Always true in Tauri environment
  const isTauriEnv = true;

  const handleBrowse = async () => {
    const selectedPath = await onBrowseFolder();
    if (selectedPath) {
      setNewPath(selectedPath);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim() || isValidating) return;
    const result = await onAddWorkspace(newPath.trim());
    if (result.success) {
      setNewPath('');
      setShowForm(false);
    }
  };

  const formatLastAccessed = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-zinc-800">
            <Sparkles className="h-10 w-10 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-zinc-100">Welcome to SpecStudio</h1>
          <p className="text-zinc-400 max-w-md mx-auto">
            AI-powered spec-driven development. Select a workspace to get started, or create a new one.
          </p>
        </div>

        {/* Recent Workspaces */}
        {workspaces.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-zinc-400">Recent Workspaces</h2>
            <div className="grid gap-2">
              {workspaces.slice(0, 5).map((workspace) => (
                <div
                  key={workspace.path}
                  className="group flex items-center gap-3 p-4 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                  onClick={() => onSelectWorkspace(workspace)}
                >
                  <FolderOpen className="h-5 w-5 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {workspace.name}
                    </p>
                    <p className="text-xs text-zinc-500 truncate font-mono">
                      {workspace.path}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-zinc-600 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatLastAccessed(workspace.lastAccessed)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveWorkspace(workspace.path);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add New Workspace */}
        <div className="space-y-3">
          {!showForm ? (
            <Button
              variant="outline"
              className="w-full h-12 border-zinc-700 border-dashed hover:bg-zinc-800 text-zinc-300"
              onClick={() => setShowForm(true)}
            >
              <FolderPlus className="h-5 w-5 mr-2" />
              {workspaces.length > 0 ? 'Add New Workspace' : 'Connect Your First Workspace'}
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="/home/user/projects/my-app"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="flex-1 bg-zinc-950 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 font-mono"
                  disabled={isValidating}
                  autoFocus
                />
                {isTauriEnv && (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-zinc-700 px-3"
                    onClick={handleBrowse}
                    disabled={isValidating}
                    title="Browse for folder"
                  >
                    <FolderSearch className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={!newPath.trim() || isValidating}
                >
                  {isValidating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Connect'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-zinc-700"
                  onClick={() => {
                    setShowForm(false);
                    setNewPath('');
                  }}
                  disabled={isValidating}
                >
                  Cancel
                </Button>
              </div>
              {validationError && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-red-950/50 border border-red-900">
                  <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-400">{validationError}</p>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Info Box */}
        <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">How it works</h3>
          <div className="grid gap-3 text-sm text-zinc-500">
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400">1</span>
              <span>Connect a project folder as your workspace</span>
            </div>
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400">2</span>
              <span>Chat with Gemini to brainstorm your feature</span>
            </div>
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400">3</span>
              <span>Click &quot;Gen Spec&quot; to turn the conversation into a specification</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ManualCommitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ManualCommitDialog({ open, onOpenChange }: ManualCommitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-zinc-100 flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Manual Git Control
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Git operations are intentionally manual in SpecStudio. Open your
            terminal to manage commits, branches, and pushes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-zinc-950 rounded-md p-4 font-mono text-sm text-zinc-300">
            <p className="text-zinc-500 mb-2"># Common git commands:</p>
            <p>git status</p>
            <p>git add .</p>
            <p>git commit -m &quot;your message&quot;</p>
            <p>git push</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-zinc-700"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
