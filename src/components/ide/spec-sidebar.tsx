'use client';

// ============================================================================
// Spec Sidebar
// Displays list of specifications from .specstudio/specs/
// ============================================================================

import { Spec } from '@/types';
import { Button } from '@/components/ui/button';
import { FileText, Trash2, Calendar, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpecSidebarProps {
  specs: Spec[];
  selectedSpec: Spec | null;
  onSelectSpec: (spec: Spec | null) => void;
  onCreateSpec: () => void;
  onDeleteSpec: (filename: string) => void;
}

export function SpecSidebar({
  specs,
  selectedSpec,
  onSelectSpec,
  onCreateSpec,
  onDeleteSpec,
}: SpecSidebarProps) {
  return (
    <div className="h-full w-full flex flex-col bg-zinc-900 border-r border-zinc-800 overflow-hidden">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Specifications
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              {specs.length} spec{specs.length !== 1 ? 's' : ''} in .specstudio/specs/
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCreateSpec}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            title="Create new spec"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-2 space-y-1">
          {specs.length === 0 ? (
            <div className="p-4 text-center">
              <FileText className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No specs yet</p>
              <p className="text-xs text-zinc-600 mt-1">
                Use &quot;Gen Spec&quot; in the chat to create one
              </p>
            </div>
          ) : (
            specs.map((spec) => (
              <SpecCard
                key={spec.filename}
                spec={spec}
                isSelected={selectedSpec?.filename === spec.filename}
                onSelect={() => onSelectSpec(spec)}
                onDelete={() => onDeleteSpec(spec.filename)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface SpecCardProps {
  spec: Spec;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function SpecCard({ spec, isSelected, onSelect, onDelete }: SpecCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${spec.title}"?`)) {
      onDelete();
    }
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group w-full text-left p-3 rounded-md transition-colors cursor-pointer',
        'hover:bg-zinc-800',
        isSelected && 'bg-zinc-800 border border-zinc-700'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 line-clamp-2">
            {spec.title}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs text-zinc-500">
            <Calendar className="h-3 w-3" />
            <span>{spec.createdAt}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 hover:bg-red-950/50 shrink-0"
          onClick={handleDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
