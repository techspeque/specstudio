'use client';

// ============================================================================
// RPC Hook
// Handles RPC actions with streaming support
// Uses Electron IPC when available, falls back to fetch/SSE for web/dev mode
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { RpcAction, RpcRequest, RpcResponse, ChatMessage, StreamEvent } from '@/types';

/**
 * Check if running in Electron environment
 */
function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.platform?.isElectron === true;
}

interface UseRpcReturn {
  execute: (action: RpcAction, payload: RpcRequest['payload']) => Promise<RpcResponse>;
  executeStream: (
    action: RpcAction,
    payload: RpcRequest['payload'],
    onEvent: (event: StreamEvent) => void
  ) => void;
  isLoading: boolean;
  cancelStream: () => void;
}

export function useRpc(): UseRpcReturn {
  const [isLoading, setIsLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const onEventRef = useRef<((event: StreamEvent) => void) | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const execute = useCallback(
    async (action: RpcAction, payload: RpcRequest['payload']): Promise<RpcResponse> => {
      setIsLoading(true);
      try {
        if (isElectron()) {
          // Use Electron IPC
          return await window.electron!.rpc.execute(action, payload as Record<string, unknown>);
        } else {
          // Fall back to fetch for web/dev mode
          const response = await fetch('/api/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload }),
          });

          const data: RpcResponse = await response.json();
          return data;
        }
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const executeStream = useCallback(
    (
      action: RpcAction,
      payload: RpcRequest['payload'],
      onEvent: (event: StreamEvent) => void
    ) => {
      // Cancel any existing stream
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      setIsLoading(true);
      onEventRef.current = onEvent;

      if (isElectron()) {
        // Use Electron IPC with streaming events
        const handleStreamData = (event: StreamEvent) => {
          onEventRef.current?.(event);
          if (event.type === 'complete') {
            setIsLoading(false);
            if (unsubscribeRef.current) {
              unsubscribeRef.current();
              unsubscribeRef.current = null;
            }
          }
        };

        // Subscribe to stream events
        unsubscribeRef.current = window.electron!.rpc.onStreamData(handleStreamData);

        // Start the streaming process
        window.electron!.rpc.stream(action, payload as Record<string, unknown>);
      } else {
        // Fall back to SSE for web/dev mode
        const encodedPayload = encodeURIComponent(JSON.stringify(payload));
        const url = `/api/rpc/stream?action=${action}&payload=${encodedPayload}`;

        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.addEventListener('output', (e) => {
          const data = JSON.parse(e.data);
          onEvent(data as StreamEvent);
        });

        eventSource.addEventListener('error', (e) => {
          if (e instanceof MessageEvent) {
            const data = JSON.parse(e.data);
            onEvent(data as StreamEvent);
          }
        });

        eventSource.addEventListener('complete', (e) => {
          const data = JSON.parse(e.data);
          onEvent(data as StreamEvent);
          eventSource.close();
          eventSourceRef.current = null;
          setIsLoading(false);
        });

        eventSource.onerror = () => {
          eventSource.close();
          eventSourceRef.current = null;
          setIsLoading(false);
        };
      }
    },
    []
  );

  const cancelStream = useCallback(async () => {
    if (isElectron()) {
      // Cancel via IPC
      await window.electron!.rpc.cancel();
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    } else {
      // Close EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
    setIsLoading(false);
  }, []);

  return {
    execute,
    executeStream,
    isLoading,
    cancelStream,
  };
}

// ============================================================================
// Chat Hook
// Manages chat history and Gemini interactions
// ============================================================================

interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (content: string, adrContext?: string) => Promise<void>;
  clearHistory: () => void;
  isLoading: boolean;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { execute } = useRpc();

  const sendMessage = useCallback(
    async (content: string, adrContext?: string) => {
      const userMessage: ChatMessage = { role: 'user', content };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const response = await execute('chat', {
          prompt: content,
          history: messages,
          adrContext,
        });

        if (response.success && response.data) {
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: response.data,
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else {
          // Add error message
          const errorMessage: ChatMessage = {
            role: 'assistant',
            content: `Error: ${response.error ?? 'Unknown error'}`,
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      } catch (err) {
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: `Error: ${(err as Error).message}`,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, execute]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    clearHistory,
    isLoading,
  };
}
