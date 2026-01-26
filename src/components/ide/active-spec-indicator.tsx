'use client';

// ============================================================================
// Active Spec Indicator
// Displays the currently selected spec in the top bar
// ============================================================================

import { FileText, ChevronRight } from 'lucide-react';
import { Spec } from '@/types';

interface ActiveSpecIndicatorProps {
  selectedSpec: Spec | null;
}

export function ActiveSpecIndicator({ selectedSpec }: ActiveSpecIndicatorProps) {
  if (!selectedSpec) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-zinc-500">
        <FileText className="h-4 w-4" />
        <span className="text-sm">No spec selected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
      <FileText className="h-4 w-4 text-blue-400 shrink-0" />
      <span className="text-sm font-medium text-zinc-200 max-w-[200px] truncate">
        {selectedSpec.title}
      </span>
      <ChevronRight className="h-3 w-3 text-zinc-600 shrink-0" />
      <span className="text-xs font-mono text-zinc-500">
        {selectedSpec.filename}
      </span>
    </div>
  );
}
