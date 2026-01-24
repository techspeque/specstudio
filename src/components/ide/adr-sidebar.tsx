'use client';

// ============================================================================
// ADR Sidebar
// Displays Architecture Decision Records
// ============================================================================

import { ADR } from '@/types';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle2, AlertCircle, Clock, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdrSidebarProps {
  adrs: ADR[];
  selectedAdr: ADR | null;
  onSelectAdr: (adr: ADR | null) => void;
}

export function AdrSidebar({ adrs, selectedAdr, onSelectAdr }: AdrSidebarProps) {
  return (
    <div className="h-full w-full flex flex-col bg-zinc-900 border-r border-zinc-800 overflow-hidden">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Architecture Decisions
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Select an ADR to set context
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-2 space-y-1">
          {/* No selection option */}
          <button
            onClick={() => onSelectAdr(null)}
            className={cn(
              'w-full text-left p-3 rounded-md transition-colors',
              'hover:bg-zinc-800',
              selectedAdr === null && 'bg-zinc-800 border border-zinc-700'
            )}
          >
            <p className="text-sm text-zinc-400">No ADR Context</p>
            <p className="text-xs text-zinc-600 mt-1">General purpose mode</p>
          </button>

          {/* ADR List */}
          {adrs.map((adr) => (
            <AdrCard
              key={adr.id}
              adr={adr}
              isSelected={selectedAdr?.id === adr.id}
              onSelect={() => onSelectAdr(adr)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface AdrCardProps {
  adr: ADR;
  isSelected: boolean;
  onSelect: () => void;
}

function AdrCard({ adr, isSelected, onSelect }: AdrCardProps) {
  const statusConfig = {
    proposed: {
      icon: Clock,
      color: 'text-yellow-400',
      bg: 'bg-yellow-950/50',
      border: 'border-yellow-800',
    },
    accepted: {
      icon: CheckCircle2,
      color: 'text-green-400',
      bg: 'bg-green-950/50',
      border: 'border-green-800',
    },
    deprecated: {
      icon: AlertCircle,
      color: 'text-orange-400',
      bg: 'bg-orange-950/50',
      border: 'border-orange-800',
    },
    superseded: {
      icon: Archive,
      color: 'text-zinc-400',
      bg: 'bg-zinc-800',
      border: 'border-zinc-700',
    },
  };

  const config = statusConfig[adr.status];
  const StatusIcon = config.icon;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left p-3 rounded-md transition-colors',
        'hover:bg-zinc-800',
        isSelected && 'bg-zinc-800 border border-zinc-700'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-200 line-clamp-2">
          {adr.title}
        </p>
        <Badge
          variant="outline"
          className={cn('shrink-0 text-xs', config.bg, config.border, config.color)}
        >
          <StatusIcon className="h-3 w-3 mr-1" />
          {adr.status}
        </Badge>
      </div>
      <p className="text-xs text-zinc-500 mt-2 line-clamp-2">{adr.context}</p>
    </button>
  );
}
