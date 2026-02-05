'use client';

// ============================================================================
// Output Console
// Bottom panel for streaming terminal output with interactive input
// ============================================================================

import { useRef, useEffect, useState } from 'react';
import { StreamEvent } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Terminal, Trash2, XCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

// Dynamic import for strip-ansi (ESM module)
let stripAnsiModule: ((text: string) => string) | null = null;
const loadStripAnsi = async () => {
  if (!stripAnsiModule) {
    try {
      const mod = await import('strip-ansi');
      stripAnsiModule = mod.default;
    } catch {
      // Fallback: return text as-is if strip-ansi fails to load
      stripAnsiModule = (text: string) => text;
    }
  }
  return stripAnsiModule;
};

// Strip ANSI codes from text
function useStripAnsi(text: string): string {
  const [cleanText, setCleanText] = useState(text);

  useEffect(() => {
    let mounted = true;
    loadStripAnsi().then((stripAnsi) => {
      if (mounted && stripAnsi) {
        setCleanText(stripAnsi(text));
      }
    });
    return () => {
      mounted = false;
    };
  }, [text]);

  return cleanText;
}

interface OutputConsoleProps {
  events: StreamEvent[];
  onClear: () => void;
  onCancel?: () => void;
  isStreaming: boolean;
}

export function OutputConsole({
  events,
  onClear,
  onCancel,
  isStreaming,
}: OutputConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [events]);

  // No manual input needed - fully automated execution

  return (
    <div className="h-full flex flex-col bg-zinc-950 border-t border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-300">Output</span>
          {isStreaming && (
            <Badge variant="outline" className="text-xs bg-green-950/50 border-green-800 text-green-400 animate-pulse">
              Streaming
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isStreaming && onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-7 text-red-400 hover:text-red-300 hover:bg-red-950/50"
            >
              <XCircle className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-7 text-zinc-500 hover:text-zinc-300"
            disabled={events.length === 0}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {/* Console Output */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 font-mono text-xs">
          {events.length === 0 ? (
            <div className="text-zinc-600 text-center py-8">
              Console output will appear here
            </div>
          ) : (
            events.map((event, index) => (
              <ConsoleLine key={index} event={event} />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Automation Status Footer - only show when streaming */}
      {isStreaming && (
        <div className="px-4 py-3 border-t border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-900/50">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-blue-400">
                <Zap className="h-3.5 w-3.5 animate-pulse" />
                <span className="font-medium">Automated Execution Running</span>
              </div>
              <Badge variant="outline" className="text-[10px] bg-blue-950/30 border-blue-800/50 text-blue-300">
                Hands-Free
              </Badge>
            </div>
            <span className="text-zinc-500 font-mono text-[10px]">
              All TUI interactions handled automatically
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ConsoleLineProps {
  event: StreamEvent;
}

function ConsoleLine({ event }: ConsoleLineProps) {
  const timestamp = new Date(event.timestamp).toLocaleTimeString();
  const cleanData = useStripAnsi(event.data);

  return (
    <div className="flex gap-2 py-0.5 hover:bg-zinc-900/50">
      <span className="text-zinc-600 shrink-0 select-none">[{timestamp}]</span>
      <span
        className={cn(
          'whitespace-pre-wrap break-all',
          event.type === 'error' && 'text-red-400',
          event.type === 'output' && 'text-zinc-300',
          event.type === 'complete' && 'text-green-400',
          event.type === 'input' && 'text-blue-400'
        )}
      >
        {cleanData}
      </span>
    </div>
  );
}
