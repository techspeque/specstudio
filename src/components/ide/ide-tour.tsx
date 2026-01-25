'use client';

// ============================================================================
// IDE Tour Component
// Interactive walkthrough using react-joyride
// ============================================================================

import { useState, useEffect } from 'react';
import Joyride, { CallBackProps, STATUS, Step, TooltipRenderProps } from '@adi-prasetyo/react-joyride';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface IdeTourProps {
  run: boolean;
  onComplete: () => void;
}

const tourSteps: Step[] = [
  {
    target: '#workspace-indicator',
    title: 'Welcome to SpecStudio',
    content: 'You are now connected to your local project. All code generated will be saved directly to this folder.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '#gemini-chat',
    title: '1. The Architect (Gemini)',
    content: 'Start here. Discuss your system design and requirements with Gemini. When ready, formulate your plan.',
    placement: 'left',
  },
  {
    target: '#spec-editor',
    title: '2. The Spec',
    content: 'Paste your final architectural plan here. This spec.md is the brain of your project.',
    placement: 'right',
  },
  {
    target: '#adr-sidebar',
    title: '3. Contextual Memory',
    content: 'These are your Architecture Decision Records (ADRs). Click one to inject its context into the AI\'s memory before generating code.',
    placement: 'right',
  },
  {
    target: '#control-bar-actions',
    title: '4. The Automation Loop',
    content: 'Click "Validate" for an architecture review. Click "Create Code" to let Claude implement the spec. Click "Gen Tests" to bulletproof it.',
    placement: 'bottom',
  },
  {
    target: '#console-output',
    title: '5. Real-Time Execution',
    content: 'Watch Claude Code operate your terminal in real-time here. Happy building!',
    placement: 'top',
  },
];

// Custom tooltip component matching the dark theme
function CustomTooltip({
  continuous,
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  tooltipProps,
  isLastStep,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl max-w-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-100">
          {step.title as string}
        </h3>
        <button
          {...closeProps}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        <p className="text-sm text-zinc-400">{step.content as string}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 bg-zinc-950/50 rounded-b-lg">
        <span className="text-xs text-zinc-500">
          {index + 1} of {tourSteps.length}
        </span>
        <div className="flex gap-2">
          {index > 0 && (
            <Button
              {...backProps}
              variant="outline"
              size="sm"
              className="h-8 border-zinc-700 hover:bg-zinc-800 text-zinc-300"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <Button
            {...primaryProps}
            size="sm"
            className="h-8 bg-blue-600 hover:bg-blue-700"
          >
            {isLastStep ? (
              'Finish'
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function IdeTour({ run, onComplete }: IdeTourProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      onComplete();
    }
  };

  if (!mounted) return null;

  return (
    <Joyride
      steps={tourSteps}
      run={run}
      continuous
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      tooltipComponent={CustomTooltip}
      styles={{
        options: {
          arrowColor: '#27272a', // zinc-800
          backgroundColor: '#18181b', // zinc-900
          overlayColor: 'rgba(0, 0, 0, 0.75)',
          primaryColor: '#2563eb', // blue-600
          textColor: '#d4d4d8', // zinc-300
          zIndex: 1000,
        },
        spotlight: {
          borderRadius: 8,
        },
      }}
      floaterProps={{
        styles: {
          arrow: {
            color: '#27272a',
          },
        },
      }}
    />
  );
}
