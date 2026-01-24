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
  GitCommit,
  Loader2,
} from 'lucide-react';
import { RpcAction } from '@/types';

interface ControlBarProps {
  onAction: (action: RpcAction) => void;
  onManualCommit: () => void;
  isLoading: boolean;
  loadingAction: RpcAction | null;
}

export function ControlBar({
  onAction,
  onManualCommit,
  isLoading,
  loadingAction,
}: ControlBarProps) {
  const actions: Array<{
    action: RpcAction;
    icon: React.ElementType;
    label: string;
    tooltip: string;
    variant?: 'default' | 'outline' | 'secondary';
  }> = [
    {
      action: 'validate',
      icon: CheckCircle,
      label: 'Validate',
      tooltip: 'Validate spec with Gemini',
      variant: 'outline',
    },
    {
      action: 'create_code',
      icon: Code2,
      label: 'Create Code',
      tooltip: 'Generate code with Claude',
      variant: 'default',
    },
    {
      action: 'gen_tests',
      icon: TestTube2,
      label: 'Gen Tests',
      tooltip: 'Generate tests with Claude',
      variant: 'outline',
    },
    {
      action: 'run_tests',
      icon: Terminal,
      label: 'Run Tests',
      tooltip: 'Execute test suite',
      variant: 'outline',
    },
    {
      action: 'run_app',
      icon: Play,
      label: 'Run App',
      tooltip: 'Start development server',
      variant: 'outline',
    },
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {/* Primary Actions */}
        <div className="flex items-center gap-2">
          {actions.map(({ action, icon: Icon, label, tooltip, variant }) => (
            <Tooltip key={action}>
              <TooltipTrigger asChild>
                <Button
                  variant={variant}
                  size="sm"
                  onClick={() => onAction(action)}
                  disabled={isLoading}
                  className={
                    variant === 'default'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'border-zinc-700 hover:bg-zinc-800'
                  }
                >
                  {loadingAction === action ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4 mr-2" />
                  )}
                  {label}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <Separator orientation="vertical" className="h-6 bg-zinc-700" />

        {/* Git Control */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onManualCommit}
              disabled={isLoading}
              className="border-amber-800 text-amber-400 hover:bg-amber-950/50 hover:text-amber-300"
            >
              <GitCommit className="h-4 w-4 mr-2" />
              Manual Commit
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Open terminal for git operations</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
