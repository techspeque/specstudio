// ============================================================================
// Shell Executor Service
// Handles local terminal execution via child_process
// ============================================================================

import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a shell command and return the result
 */
export async function executeCommand(
  command: string,
  cwd?: string,
  timeoutMs?: number
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd ?? process.cwd(),
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      env: { ...process.env, FORCE_COLOR: '0' },
      timeout: timeoutMs,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
    return {
      stdout: execError.stdout ?? '',
      stderr: execError.killed ? 'Command timed out' : (execError.stderr ?? (error as Error).message),
      exitCode: execError.code ?? 1,
    };
  }
}

/**
 * Spawn a streaming process and return chunks via callback
 */
export function spawnStreamingProcess(
  command: string,
  args: string[],
  onData: (data: string) => void,
  onError: (data: string) => void,
  onClose: (code: number) => void,
  cwd?: string
): ChildProcess {
  const child = spawn(command, args, {
    cwd: cwd ?? process.cwd(),
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  child.stdout?.on('data', (data: Buffer) => {
    onData(data.toString());
  });

  child.stderr?.on('data', (data: Buffer) => {
    onError(data.toString());
  });

  child.on('close', (code) => {
    onClose(code ?? 0);
  });

  return child;
}

/**
 * Check if a command exists on the system
 */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const { exitCode } = await executeCommand(`which ${command}`);
    return exitCode === 0;
  } catch {
    return false;
  }
}
