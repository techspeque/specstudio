'use client';

// ============================================================================
// Output Console
// Bottom panel for streaming terminal output with interactive input
// ============================================================================

import { useRef, useEffect, useState, useCallback, KeyboardEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StreamEvent } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Terminal, Trash2, XCircle, Send } from 'lucide-react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [events]);

  // Focus input when streaming starts
  useEffect(() => {
    if (isStreaming && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isStreaming]);

  const sendInput = useCallback(async () => {
    if (!inputValue.trim() || isSending || !isStreaming) return;

    setIsSending(true);
    try {
      await invoke('send_process_input', { input: inputValue });
      setInputValue('');
    } catch (err) {
      console.error('Failed to send input:', err);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [inputValue, isSending, isStreaming]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendInput();
    }
  }, [sendInput]);

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

      {/* Input Field - only show when streaming */}
      {isStreaming && (
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-xs font-mono shrink-0">&gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type input and press Enter..."
              className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-zinc-200 placeholder:text-zinc-600"
              disabled={isSending}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={sendInput}
              disabled={!inputValue.trim() || isSending}
              className="h-6 px-2 text-zinc-500 hover:text-zinc-300"
            >
              <Send className="h-3 w-3" />
            </Button>
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
