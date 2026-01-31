'use client';

// ============================================================================
// Ticket Row Component (Stateless Presentation)
// Displays ticket information and action buttons
// ============================================================================

import { Ticket } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  FlaskConical,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

interface TicketRowProps {
  ticket: Ticket;
  phaseTitle: string;
  onPlay: (ticketId: string) => void;
  onVerify: (ticketId: string) => void;
  isExecuting: boolean;
}

export function TicketRow({ ticket, phaseTitle, onPlay, onVerify, isExecuting }: TicketRowProps) {
  const status = ticket.status || 'todo';

  // Status icon mapping
  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return { Icon: Loader2, color: 'text-blue-500', label: 'Running' };
      case 'done':
        return { Icon: CheckCircle2, color: 'text-green-500', label: 'Done' };
      default:
        return { Icon: Circle, color: 'text-zinc-600', label: 'To Do' };
    }
  };

  const { Icon: StatusIcon, color: statusColor, label: statusLabel } = getStatusIcon();

  return (
    <div className="border-b border-zinc-800 last:border-0">
      <div className="group px-4 py-3 hover:bg-zinc-900/50 transition-colors">
        <div className="flex items-start gap-3">
          {/* Status Icon */}
          <div className="mt-0.5 shrink-0">
            <StatusIcon
              className={`h-5 w-5 ${statusColor} ${status === 'running' ? 'animate-spin' : ''}`}
            />
          </div>

          {/* Ticket Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant="outline"
                    className="text-xs font-mono bg-zinc-900 border-zinc-700 text-zinc-400 shrink-0"
                  >
                    {ticket.id}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ${
                      status === 'done'
                        ? 'bg-green-950/30 border-green-800 text-green-400'
                        : status === 'running'
                        ? 'bg-blue-950/30 border-blue-800 text-blue-400'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-500'
                    }`}
                  >
                    {statusLabel}
                  </Badge>
                </div>
                <h4 className="text-sm font-medium text-zinc-200 leading-snug">
                  {ticket.title}
                </h4>
              </div>

              {/* Action Buttons */}
              <div
                className={`flex items-center gap-1 shrink-0 transition-opacity ${
                  status === 'running' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onPlay(ticket.id)}
                  disabled={isExecuting || status === 'running' || status === 'done'}
                  className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30"
                  title={status === 'done' ? 'Ticket already completed' : 'Execute ticket'}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onVerify(ticket.id)}
                  disabled={isExecuting || status === 'running'}
                  className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30"
                  title="Verify ticket"
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Requirements */}
            {ticket.requirements.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Requirements
                </p>
                <ul className="space-y-1">
                  {ticket.requirements.map((req, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-zinc-400">
                      <ChevronRight className="h-3 w-3 mt-0.5 text-zinc-600 shrink-0" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Acceptance Criteria */}
            {ticket.acceptance_criteria.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Acceptance Criteria
                </p>
                <ul className="space-y-1">
                  {ticket.acceptance_criteria.map((criteria, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-zinc-400">
                      <ChevronRight className="h-3 w-3 mt-0.5 text-zinc-600 shrink-0" />
                      <span>{criteria}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
