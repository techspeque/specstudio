// ============================================================================
// Claude Code CLI Service
// Handles code generation and test generation via Claude CLI
// ============================================================================

import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { executeCommand, spawnStreamingProcess } from './shell';
import { ChildProcess } from 'child_process';

const TEMP_PROMPT_FILE = 'temp_prompt.txt';

/**
 * Execute Claude Code CLI with a prompt
 */
export async function executeClaudeCode(
  prompt: string,
  workingDirectory?: string
): Promise<{ output: string; error: string; exitCode: number }> {
  const tempPath = join(tmpdir(), TEMP_PROMPT_FILE);
  const cwd = workingDirectory ?? process.cwd();

  try {
    // Write prompt to temp file
    await writeFile(tempPath, prompt, 'utf-8');

    // Execute Claude CLI
    const result = await executeCommand(
      `claude -p "${tempPath}" --dangerously-skip-permissions`,
      cwd
    );

    return {
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode,
    };
  } finally {
    // Clean up temp file
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Stream Claude Code CLI output in real-time
 */
export function streamClaudeCode(
  prompt: string,
  onData: (data: string) => void,
  onError: (data: string) => void,
  onClose: (code: number) => void,
  workingDirectory?: string
): { process: ChildProcess | null; cleanup: () => Promise<void> } {
  const tempPath = join(tmpdir(), TEMP_PROMPT_FILE);
  const cwd = workingDirectory ?? process.cwd();
  let childProcess: ChildProcess | null = null;

  // Write prompt and start process
  writeFile(tempPath, prompt, 'utf-8')
    .then(() => {
      childProcess = spawnStreamingProcess(
        'claude',
        ['-p', tempPath, '--dangerously-skip-permissions'],
        onData,
        onError,
        (code) => {
          // Clean up temp file after process completes
          unlink(tempPath).catch(() => {});
          onClose(code);
        },
        cwd
      );
    })
    .catch((err) => {
      onError(`Failed to start Claude: ${err.message}`);
      onClose(1);
    });

  return {
    process: childProcess,
    cleanup: async () => {
      try {
        await unlink(tempPath);
      } catch {
        // Ignore
      }
    },
  };
}

/**
 * Generate code from a specification
 */
export async function generateCode(
  specContent: string,
  workingDirectory?: string
): Promise<{ output: string; error: string; exitCode: number }> {
  const prompt = `You are implementing code based on the following specification.

## Specification
${specContent}

## Instructions
1. Implement the code according to the specification
2. Follow best practices
3. Create necessary files and directories
4. Do NOT commit any changes - git operations are handled manually by the user`;

  return executeClaudeCode(prompt, workingDirectory);
}

/**
 * Generate tests from a specification
 */
export async function generateTests(
  specContent: string,
  workingDirectory?: string
): Promise<{ output: string; error: string; exitCode: number }> {
  const prompt = `You are generating tests based on the following specification.

## Specification
${specContent}

## Instructions
1. Generate comprehensive tests for the specified functionality
2. Include unit tests, integration tests where appropriate
3. Follow the testing conventions established in the project
4. Do NOT commit any changes - git operations are handled manually by the user`;

  return executeClaudeCode(prompt, workingDirectory);
}
