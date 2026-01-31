'use client';

// ============================================================================
// Chat Panel
// Gemini chat interface with context awareness
// ============================================================================

import { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, Spec } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Sparkles, Send, Loader2, User, Trash2, FilePlus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  estimateTokens,
  formatTokenCount,
  getContextUsagePercent,
  getUsageColorClass,
  isApproachingLimit,
} from '@/lib/utils/tokens';
import { loadSettingsFromStore } from '@/components/ide/settings-dialog';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  selectedSpec: Spec | null;
  specContent?: string;
  onSendMessage: (content: string) => void;
  onClearHistory: () => void;
  onGenSpec: () => void;
  isGeneratingSpec: boolean;
}

export function ChatPanel({
  messages,
  isLoading,
  selectedSpec,
  specContent,
  onSendMessage,
  onClearHistory,
  onGenSpec,
  isGeneratingSpec,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load settings to get the current model
  useEffect(() => {
    loadSettingsFromStore().then((settings) => {
      setGeminiModel(settings.geminiModel);
    });
  }, []);

  // Calculate total tokens from messages + input + spec content
  const tokenInfo = useMemo(() => {
    const messageTokens = messages.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0
    );
    const inputTokens = estimateTokens(input);
    const specTokens = specContent ? estimateTokens(specContent) : 0;
    const totalTokens = messageTokens + inputTokens + specTokens;
    const usagePercent = getContextUsagePercent(totalTokens, geminiModel);
    const colorClass = getUsageColorClass(usagePercent);
    const approaching = isApproachingLimit(totalTokens, geminiModel);

    return {
      totalTokens,
      usagePercent,
      colorClass,
      approaching,
      formatted: formatTokenCount(totalTokens),
    };
  }, [messages, input, specContent, geminiModel]);

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

  const canGenSpec = messages.length > 0 && !isLoading && !isGeneratingSpec;

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-zinc-300">Design Assistant</span>
          {selectedSpec && (
            <Badge variant="outline" className="text-xs bg-zinc-800 border-zinc-700 text-zinc-400">
              Editing: {selectedSpec.title}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Token Counter Badge */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn('text-xs font-mono', tokenInfo.colorClass)}
                >
                  {tokenInfo.formatted} tokens
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tokenInfo.usagePercent.toFixed(1)}% of context used</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
      </div>

      {/* Context Limit Warning */}
      {tokenInfo.approaching && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-950/30 border-b border-red-900/50 text-red-400 text-xs">
          <AlertTriangle className="h-3 w-3" />
          <span>Approaching context limit ({tokenInfo.usagePercent.toFixed(0)}%). Consider clearing history.</span>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {messages.length === 0 ? (
            <EmptyState />
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
            placeholder="Describe the feature you want to build..."
            className={`
              flex-1 min-h-[60px] max-h-[150px] resize-none
              bg-zinc-950 border-zinc-700
              text-zinc-200 placeholder:text-zinc-600
              text-sm
              focus-visible:ring-1 focus-visible:ring-zinc-600
            `}
            disabled={isLoading || isGeneratingSpec}
          />
          <div className="flex flex-col gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className={cn(
                      'h-[28px] w-[60px] border-zinc-700',
                      canGenSpec
                        ? 'bg-green-600 hover:bg-green-700 border-green-600 text-white'
                        : 'text-zinc-500'
                    )}
                    disabled={!canGenSpec}
                    onClick={onGenSpec}
                  >
                    {isGeneratingSpec ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FilePlus className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>Generate markdown spec from chat</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              type="submit"
              size="icon"
              className="h-[28px] w-[60px] bg-blue-600 hover:bg-blue-700"
              disabled={!input.trim() || isLoading || isGeneratingSpec}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
      <Sparkles className="h-12 w-12 text-zinc-700 mb-4" />
      <h3 className="text-sm font-medium text-zinc-400 mb-2">
        Design Assistant
      </h3>
      <p className="text-xs text-zinc-600 max-w-xs">
        Describe the feature you want to build. When you&apos;re ready, click the green button to generate a spec.
      </p>
    </div>
  );
}
