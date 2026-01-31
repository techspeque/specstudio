'use client';

// ============================================================================
// Plan Viewer
// Displays Development Plan with phases and tickets
// ============================================================================

import { DevelopmentPlan, Phase } from '@/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { TicketRow } from './ticket-row';

interface PlanViewerProps {
  plan?: DevelopmentPlan | null;
  isExecuting?: boolean;
  onPlayTicket?: (ticketId: string) => void;
  onVerifyTicket?: (ticketId: string) => void;
}

// ============================================================================
// Phase Component
// ============================================================================

function PhaseSection({
  phase,
  phaseIndex,
  isExecuting,
  onPlayTicket,
  onVerifyTicket,
}: {
  phase: Phase;
  phaseIndex: number;
  isExecuting: boolean;
  onPlayTicket: (ticketId: string) => void;
  onVerifyTicket: (ticketId: string) => void;
}) {
  const totalTickets = phase.tickets.length;
  const doneTickets = phase.tickets.filter((t) => t.status === 'done').length;

  return (
    <AccordionItem value={`phase-${phaseIndex}`}>
      <AccordionTrigger>
        <div className="flex items-center justify-between w-full pr-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-zinc-200">{phase.title}</span>
            <Badge variant="outline" className="text-xs bg-zinc-900 border-zinc-700 text-zinc-400">
              {doneTickets}/{totalTickets} tickets
            </Badge>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-0">
          {/* Phase Description */}
          <div className="px-4 py-3 bg-zinc-950/50 border-b border-zinc-800">
            <p className="text-sm text-zinc-400 leading-relaxed">{phase.description}</p>
          </div>

          {/* Tickets */}
          <div>
            {phase.tickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                phaseTitle={phase.title}
                onPlay={onPlayTicket}
                onVerify={onVerifyTicket}
                isExecuting={isExecuting}
              />
            ))}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ============================================================================
// Main Plan Viewer Component
// ============================================================================

export function PlanViewer({
  plan,
  isExecuting = false,
  onPlayTicket,
  onVerifyTicket,
}: PlanViewerProps) {
  // Empty state when no plan is loaded
  if (!plan) {
    return (
      <div className="h-full flex flex-col bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-zinc-500" />
            <span className="text-sm font-medium text-zinc-300">Development Plan</span>
          </div>
        </div>

        {/* Empty State */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Sparkles className="h-12 w-12 text-zinc-700 mb-4" />
          <h3 className="text-sm font-medium text-zinc-400 mb-2">No Plan Loaded</h3>
          <p className="text-xs text-zinc-600 max-w-xs">
            Chat with Gemini to generate a development plan. Say "create a plan" or "formulate" to
            generate structured output.
          </p>
        </div>
      </div>
    );
  }

  // Calculate overall progress
  const allTickets = plan.phases.flatMap((p) => p.tickets);
  const totalTickets = allTickets.length;
  const doneTickets = allTickets.filter((t) => t.status === 'done').length;
  const progressPercent = totalTickets > 0 ? Math.round((doneTickets / totalTickets) * 100) : 0;

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-zinc-300">Development Plan</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs bg-zinc-800 border-zinc-700 text-zinc-400">
            {doneTickets}/{totalTickets} completed
          </Badge>
          <Badge variant="outline" className="text-xs bg-blue-950/30 border-blue-800 text-blue-400">
            {progressPercent}%
          </Badge>
        </div>
      </div>

      {/* Plan Overview */}
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="p-4 space-y-2">
          <h2 className="text-base font-semibold text-zinc-100">{plan.title}</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">{plan.overview}</p>
        </div>
      </div>

      {/* Phases Accordion */}
      <div className="flex-1 overflow-y-auto">
        <Accordion
          type="multiple"
          className="w-full"
          defaultValue={plan.phases.map((_, i) => `phase-${i}`)}
        >
          {plan.phases.map((phase, idx) => (
            <PhaseSection
              key={idx}
              phase={phase}
              phaseIndex={idx}
              isExecuting={isExecuting}
              onPlayTicket={onPlayTicket || (() => {})}
              onVerifyTicket={onVerifyTicket || (() => {})}
            />
          ))}
        </Accordion>
      </div>
    </div>
  );
}
