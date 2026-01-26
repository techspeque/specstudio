'use client';

// ============================================================================
// File Explorer
// Collapsible tree view for project files with modified file indicators
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
  modified?: boolean;
}

interface FileTreeResult {
  root: FileNode;
  totalFiles: number;
  totalDirs: number;
}

interface FileExplorerProps {
  workingDirectory: string;
  changedFiles?: string[];
  onSelectFile: (filePath: string) => void;
  selectedFile?: string | null;
}

// ============================================================================
// Component
// ============================================================================

export function FileExplorer({
  workingDirectory,
  changedFiles = [],
  onSelectFile,
  selectedFile,
}: FileExplorerProps) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const loadTree = useCallback(async () => {
    if (!workingDirectory) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<FileTreeResult>('get_file_tree', {
        workingDirectory,
        maxDepth: 10,
        changedFiles,
      });
      setTree(result.root);

      // Auto-expand root
      setExpandedDirs(new Set(['']));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [workingDirectory, changedFiles]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900">
        <span className="text-sm font-medium text-zinc-300">Files</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadTree}
          disabled={isLoading}
          className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-300"
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        {error ? (
          <div className="p-4 text-sm text-red-400">{error}</div>
        ) : isLoading && !tree ? (
          <div className="p-4 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : tree ? (
          <div className="py-2">
            {tree.children?.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                expandedDirs={expandedDirs}
                onToggleDir={toggleDir}
                onSelectFile={onSelectFile}
                selectedFile={selectedFile}
              />
            ))}
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
}

// ============================================================================
// Tree Node Component
// ============================================================================

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  selectedFile?: string | null;
}

function TreeNode({
  node,
  depth,
  expandedDirs,
  onToggleDir,
  onSelectFile,
  selectedFile,
}: TreeNodeProps) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedFile === node.path;
  const paddingLeft = depth * 12 + 8;

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => onToggleDir(node.path)}
          className={cn(
            'w-full flex items-center gap-1 py-1 pr-2 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors',
          )}
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-blue-400" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-blue-400" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
                selectedFile={selectedFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        'w-full flex items-center gap-1 py-1 pr-2 text-sm transition-colors',
        isSelected
          ? 'bg-blue-600/20 text-blue-300'
          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200',
      )}
      style={{ paddingLeft: paddingLeft + 12 }}
    >
      <File className="h-4 w-4 shrink-0 text-zinc-500" />
      <span className="truncate">{node.name}</span>
      {node.modified && (
        <span className="ml-auto px-1 text-[10px] font-medium text-yellow-400 bg-yellow-950/50 rounded">
          M
        </span>
      )}
    </button>
  );
}
