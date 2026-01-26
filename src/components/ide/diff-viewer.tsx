'use client';

// ============================================================================
// Diff Viewer
// Shows side-by-side or unified diff for modified files
// ============================================================================

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Loader2, X, Columns, AlignLeft } from 'lucide-react';

// Dynamic import to avoid SSR issues
const ReactDiffViewer = dynamic(() => import('react-diff-viewer-continued'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
    </div>
  ),
});

// ============================================================================
// Types
// ============================================================================

interface DiffViewerProps {
  workingDirectory: string;
  filePath: string;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function DiffViewer({ workingDirectory, filePath, onClose }: DiffViewerProps) {
  const [oldContent, setOldContent] = useState<string>('');
  const [newContent, setNewContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [splitView, setSplitView] = useState(true);

  useEffect(() => {
    async function loadDiff() {
      setIsLoading(true);
      setError(null);

      try {
        // Load original content from HEAD
        const original = await invoke<string>('git_show_file', {
          workingDirectory,
          filePath,
          gitRef: 'HEAD',
        });

        // Load current content from disk
        const current = await invoke<string>('read_file', {
          workingDirectory,
          filePath,
        });

        setOldContent(original);
        setNewContent(current);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }

    loadDiff();
  }, [workingDirectory, filePath]);

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-300">Diff:</span>
          <span className="text-sm font-mono text-zinc-400">{filePath}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSplitView(!splitView)}
            className="h-7 px-2 text-zinc-400 hover:text-zinc-200"
            title={splitView ? 'Unified view' : 'Split view'}
          >
            {splitView ? (
              <AlignLeft className="h-4 w-4" />
            ) : (
              <Columns className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-400">{error}</div>
        ) : (
          <ReactDiffViewer
            oldValue={oldContent}
            newValue={newContent}
            splitView={splitView}
            useDarkTheme={true}
            leftTitle="HEAD (Original)"
            rightTitle="Current (Modified)"
            styles={{
              variables: {
                dark: {
                  diffViewerBackground: '#09090b',
                  diffViewerColor: '#a1a1aa',
                  addedBackground: '#052e16',
                  addedColor: '#86efac',
                  removedBackground: '#450a0a',
                  removedColor: '#fca5a5',
                  wordAddedBackground: '#166534',
                  wordRemovedBackground: '#991b1b',
                  addedGutterBackground: '#14532d',
                  removedGutterBackground: '#7f1d1d',
                  gutterBackground: '#18181b',
                  gutterColor: '#52525b',
                  codeFoldBackground: '#27272a',
                  codeFoldGutterBackground: '#27272a',
                  emptyLineBackground: '#18181b',
                  highlightBackground: '#3f3f46',
                  highlightGutterBackground: '#3f3f46',
                },
              },
              contentText: {
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: '13px',
              },
            }}
          />
        )}
      </div>
    </div>
  );
}
