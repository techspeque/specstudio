'use client';

// ============================================================================
// Control Bar
// Primary action buttons for IDE operations
// ============================================================================

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Code2,
  CheckCircle,
  TestTube2,
  Play,
  Terminal,
  Github,
  Loader2,
  Undo2,
} from 'lucide-react';
import { RpcAction } from '@/types';

interface ControlBarProps {
  onAction: (action: RpcAction) => void;
  onManualCommit: () => void;
  onRevert?: () => void;
  isLoading: boolean;
  loadingAction: RpcAction | null;
  hasGitChanges?: boolean;
  showRevertButton?: boolean;
}

export function ControlBar({
  onAction,
  onManualCommit,
  onRevert,
  isLoading,
  loadingAction,
  hasGitChanges,
  showRevertButton,
}: ControlBarProps) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 flex-nowrap">
        {/* Joined AI Build Loop Group */}
        <div className="flex items-center">
          {/* Validate */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAction('validate')}
                disabled={isLoading}
                className="rounded-r-none border-zinc-700 hover:bg-zinc-800"
              >
                {loadingAction === 'validate' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Validate
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Validate spec with Gemini</p>
            </TooltipContent>
          </Tooltip>

          {/* Create Code */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                onClick={() => onAction('create_code')}
                disabled={isLoading}
                className="rounded-none border-l-0 bg-blue-600 hover:bg-blue-700"
              >
                {loadingAction === 'create_code' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Code2 className="h-4 w-4 mr-2" />
                )}
                Create Code
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Generate code with Claude</p>
            </TooltipContent>
          </Tooltip>

          {/* Gen Tests */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAction('gen_tests')}
                disabled={isLoading}
                className="rounded-l-none border-l-0 border-zinc-700 hover:bg-zinc-800"
              >
                {loadingAction === 'gen_tests' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <TestTube2 className="h-4 w-4 mr-2" />
                )}
                Gen Tests
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Generate tests with Claude</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6 bg-zinc-700" />

        {/* Icon-Only Execution Controls */}
        <div className="flex items-center gap-1">
          {/* Run Tests */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAction('run_tests')}
                disabled={isLoading}
                className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                {loadingAction === 'run_tests' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Terminal className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Run Tests</p>
            </TooltipContent>
          </Tooltip>

          {/* Run App */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAction('run_app')}
                disabled={isLoading}
                className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                {loadingAction === 'run_app' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Run App</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6 bg-zinc-700" />

        {/* Git Controls - Separated for Safety */}
        <div className="flex items-center gap-2">
          {/* Revert Button - Only shown after Claude operations when there are changes */}
          {showRevertButton && hasGitChanges && onRevert && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRevert}
                  disabled={isLoading}
                  className="border-red-800 text-red-400 hover:bg-red-950/50 hover:text-red-300"
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Undo Changes
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Revert all changes made by Claude</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Git Control */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onManualCommit}
                disabled={isLoading}
                className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <Github className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Manual Commit</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
