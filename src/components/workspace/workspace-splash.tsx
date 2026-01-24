'use client';

// ============================================================================
// Workspace Splash Screen
// Shows recent workspaces and allows adding new ones
// ============================================================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  FolderOpen,
  Loader2,
  AlertCircle,
  FolderPlus,
  Clock,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { Workspace } from '@/hooks/use-workspace-target';

interface WorkspaceSplashProps {
  workspaces: Workspace[];
  onSelectWorkspace: (workspace: Workspace) => void;
  onAddWorkspace: (path: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveWorkspace: (path: string) => void;
  isValidating: boolean;
  error: string | null;
}

export function WorkspaceSplash({
  workspaces,
  onSelectWorkspace,
  onAddWorkspace,
  onRemoveWorkspace,
  isValidating,
  error,
}: WorkspaceSplashProps) {
  const [showNewForm, setShowNewForm] = useState(workspaces.length === 0);
  const [newPath, setNewPath] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim() || isValidating) return;
    const result = await onAddWorkspace(newPath.trim());
    if (result.success) {
      setNewPath('');
      setShowNewForm(false);
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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-xl bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800">
            <FolderOpen className="h-8 w-8 text-blue-400" />
          </div>
          <CardTitle className="text-2xl text-zinc-100">SpecStudio</CardTitle>
          <CardDescription className="text-zinc-400">
            Select a workspace to get started
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Recent Workspaces */}
          {workspaces.length > 0 && !showNewForm && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-400">Recent Workspaces</h3>
              <div className="space-y-1">
                {workspaces.map((workspace) => (
                  <div
                    key={workspace.path}
                    className="group flex items-center gap-2 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer"
                    onClick={() => onSelectWorkspace(workspace)}
                  >
                    <FolderOpen className="h-5 w-5 text-zinc-500 shrink-0" />
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
                      <ChevronRight className="h-4 w-4 text-zinc-600" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Separator */}
          {workspaces.length > 0 && !showNewForm && (
            <div className="relative">
              <Separator className="bg-zinc-800" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-900 px-2 text-xs text-zinc-500">
                or
              </span>
            </div>
          )}

          {/* Add New Workspace Button */}
          {!showNewForm && (
            <Button
              variant="outline"
              className="w-full border-zinc-700 hover:bg-zinc-800 text-zinc-300"
              onClick={() => setShowNewForm(true)}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Add New Workspace
            </Button>
          )}

          {/* New Workspace Form */}
          {showNewForm && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="workspace-path" className="text-sm font-medium text-zinc-300">
                  Project Path
                </label>
                <Input
                  id="workspace-path"
                  type="text"
                  placeholder="/home/user/projects/my-app"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="bg-zinc-950 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 font-mono"
                  disabled={isValidating}
                  autoFocus
                />
                <p className="text-xs text-zinc-500">
                  Enter the full path to your project. It will be created if it doesn&apos;t exist.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-red-950/50 border border-red-900">
                  <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                {workspaces.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-zinc-700"
                    onClick={() => {
                      setShowNewForm(false);
                      setNewPath('');
                    }}
                    disabled={isValidating}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  className={`${workspaces.length > 0 ? 'flex-1' : 'w-full'} bg-blue-600 hover:bg-blue-700`}
                  disabled={!newPath.trim() || isValidating}
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <FolderPlus className="h-4 w-4 mr-2" />
                      Connect Workspace
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Info Box */}
          <div className="mt-4 p-4 rounded-md bg-zinc-800/50 border border-zinc-700">
            <h4 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-400" />
              How it works
            </h4>
            <ul className="text-xs text-zinc-500 space-y-1">
              <li>All generated code will be saved to this directory</li>
              <li>Claude Code will execute commands in this workspace</li>
              <li>Git operations remain manual - you control commits</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
