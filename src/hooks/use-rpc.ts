'use client';

// ============================================================================
// RPC Hook
// Handles RPC actions with streaming support
// Uses Tauri IPC via invoke() and listen()
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { RpcAction, RpcRequest, RpcResponse, ChatMessage, StreamEvent } from '@/types';

interface SpawnResult {
  started: boolean;
  processId: string;
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
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const onEventRef = useRef<((event: StreamEvent) => void) | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  const execute = useCallback(
    async (action: RpcAction, payload: RpcRequest['payload']): Promise<RpcResponse> => {
      setIsLoading(true);
      try {
        // For non-streaming actions like 'chat' and 'validate', we need a different approach
        // These will be implemented in Step 5 with Gemini integration
        // For now, return a stub response
        console.warn(`Non-streaming action '${action}' not yet implemented in Tauri backend`);
        return {
          success: false,
          action,
          error: `Action '${action}' not yet implemented`,
        };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const executeStream = useCallback(
    async (
      action: RpcAction,
      payload: RpcRequest['payload'],
      onEvent: (event: StreamEvent) => void
    ) => {
      // Cancel any existing stream
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      setIsLoading(true);
      onEventRef.current = onEvent;

      try {
        // Set up event listener for streaming data
        unlistenRef.current = await listen<StreamEvent>('rpc:stream:data', (event) => {
          const streamEvent = event.payload;
          onEventRef.current?.(streamEvent);

          if (streamEvent.type === 'complete') {
            setIsLoading(false);
            if (unlistenRef.current) {
              unlistenRef.current();
              unlistenRef.current = null;
            }
          }
        });

        // Start the streaming process
        await invoke<SpawnResult>('spawn_streaming_process', {
          action,
          workingDirectory: payload.workingDirectory,
          specContent: payload.specContent,
          adrContext: payload.adrContext,
        });
      } catch (err) {
        // Emit error event
        onEvent({
          type: 'error',
          data: `Failed to start process: ${err}`,
          timestamp: Date.now(),
        });
        onEvent({
          type: 'complete',
          data: 'Process failed to start',
          timestamp: Date.now(),
        });
        setIsLoading(false);
      }
    },
    []
  );

  const cancelStream = useCallback(async () => {
    try {
      await invoke('cancel_streaming_processes');
    } catch (err) {
      console.error('Failed to cancel streaming processes:', err);
    }

    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
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
// Manages chat history and Gemini interactions with streaming
// ============================================================================

interface ChatResult {
  started: boolean;
  sessionId: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (content: string, specContent?: string, adrContext?: string) => Promise<void>;
  clearHistory: () => void;
  isLoading: boolean;
  cancelChat: () => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const currentResponseRef = useRef<string>('');

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string, specContent?: string, adrContext?: string) => {
      const userMessage: ChatMessage = { role: 'user', content };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      currentResponseRef.current = '';

      // Clean up previous listener
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      try {
        // Add placeholder assistant message that will be updated with streaming content
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

        // Set up event listener for streaming data
        unlistenRef.current = await listen<StreamEvent>('rpc:stream:data', (event) => {
          const streamEvent = event.payload;

          if (streamEvent.type === 'output') {
            currentResponseRef.current += streamEvent.data;
            // Update the last message (assistant's response) with accumulated content
            setMessages((prev) => {
              const updated = [...prev];
              if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: currentResponseRef.current,
                };
              }
              return updated;
            });
          } else if (streamEvent.type === 'error') {
            // Append error to current response
            currentResponseRef.current += `\n\nError: ${streamEvent.data}`;
            setMessages((prev) => {
              const updated = [...prev];
              if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: currentResponseRef.current,
                };
              }
              return updated;
            });
          } else if (streamEvent.type === 'complete') {
            setIsLoading(false);
            if (unlistenRef.current) {
              unlistenRef.current();
              unlistenRef.current = null;
            }
          }
        });

        // Get history for Gemini (excluding the last assistant placeholder)
        const historyForGemini = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Start the Gemini chat
        await invoke<ChatResult>('chat_with_gemini', {
          prompt: content,
          history: historyForGemini,
          specContent,
          adrContext,
        });
      } catch (err) {
        // Update the assistant message with error
        setMessages((prev) => {
          const updated = [...prev];
          if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
            updated[updated.length - 1] = {
              role: 'assistant',
              content: `Error: ${(err as Error).message}`,
            };
          }
          return updated;
        });
        setIsLoading(false);
      }
    },
    [messages]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    currentResponseRef.current = '';
  }, []);

  const cancelChat = useCallback(() => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    setIsLoading(false);
  }, []);

  return {
    messages,
    sendMessage,
    clearHistory,
    isLoading,
    cancelChat,
  };
}
