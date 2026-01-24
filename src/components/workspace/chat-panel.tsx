'use client';

// ============================================================================
// Chat Panel
// Gemini chat interface with context awareness
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { ChatMessage, ADR } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Send, Loader2, User, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  selectedAdr: ADR | null;
  onSendMessage: (content: string) => void;
  onClearHistory: () => void;
}

export function ChatPanel({
  messages,
  isLoading,
  selectedAdr,
  onSendMessage,
  onClearHistory,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-zinc-300">Gemini Assistant</span>
          {selectedAdr && (
            <Badge variant="outline" className="text-xs bg-zinc-800 border-zinc-700 text-zinc-400">
              Context: {selectedAdr.title}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearHistory}
          className="h-7 text-zinc-500 hover:text-zinc-300"
          disabled={messages.length === 0}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {messages.length === 0 ? (
            <EmptyState selectedAdr={selectedAdr} />
          ) : (
            messages.map((message, index) => (
              <MessageBubble key={index} message={message} />
            ))
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800 bg-zinc-900">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Gemini about your spec..."
            className={`
              flex-1 min-h-[60px] max-h-[150px] resize-none
              bg-zinc-950 border-zinc-700
              text-zinc-200 placeholder:text-zinc-600
              text-sm
              focus-visible:ring-1 focus-visible:ring-zinc-600
            `}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="h-[60px] w-[60px] bg-blue-600 hover:bg-blue-700"
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
        <p className="text-xs text-zinc-600 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-zinc-700' : 'bg-blue-600'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-zinc-300" />
        ) : (
          <Sparkles className="h-4 w-4 text-white" />
        )}
      </div>
      <div
        className={cn(
          'flex-1 rounded-lg px-4 py-3 text-sm',
          isUser
            ? 'bg-zinc-800 text-zinc-200'
            : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
        )}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  selectedAdr: ADR | null;
}

function EmptyState({ selectedAdr }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
      <Sparkles className="h-12 w-12 text-zinc-700 mb-4" />
      <h3 className="text-sm font-medium text-zinc-400 mb-2">
        Gemini Assistant
      </h3>
      <p className="text-xs text-zinc-600 max-w-xs">
        {selectedAdr
          ? `Ask questions about your spec in the context of "${selectedAdr.title}"`
          : 'Ask questions about your specification, get implementation advice, or validate your requirements.'}
      </p>
    </div>
  );
}
