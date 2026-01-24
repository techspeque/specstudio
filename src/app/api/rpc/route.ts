// ============================================================================
// RPC API Route
// Unified endpoint for LLM and Git actions
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { RpcRequest, RpcResponse, RpcAction } from '@/types';
import { chat, validateSpec } from '@/lib/services/gemini';
import { generateCode, generateTests } from '@/lib/services/claude';
import { executeCommand } from '@/lib/services/shell';

const VALID_ACTIONS: RpcAction[] = [
  'chat',
  'validate',
  'create_code',
  'gen_tests',
  'run_tests',
  'run_app',
];

/**
 * POST /api/rpc - Execute an RPC action
 */
export async function POST(request: NextRequest): Promise<NextResponse<RpcResponse>> {
  let body: RpcRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        action: 'chat' as RpcAction,
        error: 'Invalid JSON body',
      },
      { status: 400 }
    );
  }

  const { action, payload } = body;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      {
        success: false,
        action: action ?? ('chat' as RpcAction),
        error: `Invalid action. Valid actions: ${VALID_ACTIONS.join(', ')}`,
      },
      { status: 400 }
    );
  }

  try {
    const result = await executeAction(action, payload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        action,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * Execute the requested action
 */
async function executeAction(
  action: RpcAction,
  payload: RpcRequest['payload']
): Promise<RpcResponse> {
  switch (action) {
    case 'chat':
      return handleChat(payload);
    case 'validate':
      return handleValidate(payload);
    case 'create_code':
      return handleCreateCode(payload);
    case 'gen_tests':
      return handleGenTests(payload);
    case 'run_tests':
      return handleRunTests(payload);
    case 'run_app':
      return handleRunApp(payload);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Handle chat action (Gemini)
 */
async function handleChat(payload: RpcRequest['payload']): Promise<RpcResponse> {
  if (!payload.prompt) {
    throw new Error('Prompt is required for chat action');
  }

  const systemContext = payload.adrContext
    ? `You are an AI assistant helping with spec-driven development.
Consider this architectural context:\n${payload.adrContext}`
    : undefined;

  const response = await chat(payload.prompt, payload.history ?? [], systemContext);

  return {
    success: true,
    action: 'chat',
    data: response,
  };
}

/**
 * Handle validate action (Gemini)
 */
async function handleValidate(payload: RpcRequest['payload']): Promise<RpcResponse> {
  if (!payload.specContent) {
    throw new Error('specContent is required for validate action');
  }

  const response = await validateSpec(
    payload.specContent,
    payload.adrContext,
    payload.workingDirectory
  );

  return {
    success: true,
    action: 'validate',
    data: response,
  };
}

/**
 * Handle create_code action (Claude Code CLI)
 */
async function handleCreateCode(payload: RpcRequest['payload']): Promise<RpcResponse> {
  if (!payload.specContent) {
    throw new Error('specContent is required for create_code action');
  }

  const result = await generateCode(
    payload.specContent,
    payload.adrContext,
    payload.workingDirectory
  );

  if (result.exitCode !== 0) {
    return {
      success: false,
      action: 'create_code',
      error: result.error || 'Code generation failed',
      data: result.output,
    };
  }

  return {
    success: true,
    action: 'create_code',
    data: result.output,
  };
}

/**
 * Handle gen_tests action (Claude Code CLI)
 */
async function handleGenTests(payload: RpcRequest['payload']): Promise<RpcResponse> {
  if (!payload.specContent) {
    throw new Error('specContent is required for gen_tests action');
  }

  const result = await generateTests(
    payload.specContent,
    payload.adrContext,
    payload.workingDirectory
  );

  if (result.exitCode !== 0) {
    return {
      success: false,
      action: 'gen_tests',
      error: result.error || 'Test generation failed',
      data: result.output,
    };
  }

  return {
    success: true,
    action: 'gen_tests',
    data: result.output,
  };
}

/**
 * Handle run_tests action (shell)
 */
async function handleRunTests(payload: RpcRequest['payload']): Promise<RpcResponse> {
  const cwd = payload.workingDirectory ?? process.cwd();

  // Try common test runners
  const testCommands = ['npm test', 'npm run test', 'yarn test', 'pnpm test'];
  let result = { stdout: '', stderr: '', exitCode: 1 };

  for (const cmd of testCommands) {
    result = await executeCommand(cmd, cwd);
    if (result.exitCode === 0 || result.stdout.includes('PASS')) {
      break;
    }
  }

  return {
    success: result.exitCode === 0,
    action: 'run_tests',
    data: result.stdout,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

/**
 * Handle run_app action (shell)
 */
async function handleRunApp(payload: RpcRequest['payload']): Promise<RpcResponse> {
  const cwd = payload.workingDirectory ?? process.cwd();

  // Try to start the app in dev mode
  const result = await executeCommand('npm run dev &', cwd);

  return {
    success: true,
    action: 'run_app',
    data: 'Development server starting...\n' + result.stdout,
  };
}
