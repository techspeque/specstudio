// ============================================================================
// Streaming RPC API Route
// Server-Sent Events endpoint for real-time command output
// ============================================================================

import { NextRequest } from 'next/server';
import { RpcAction } from '@/types';
import { streamClaudeCode } from '@/lib/services/claude';
import { spawnStreamingProcess } from '@/lib/services/shell';

/**
 * GET /api/rpc/stream - Stream command output via SSE
 */
export async function GET(request: NextRequest): Promise<Response> {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') as RpcAction | null;
  const encodedPayload = searchParams.get('payload');

  if (!action || !encodedPayload) {
    return new Response('Missing action or payload', { status: 400 });
  }

  const payload = JSON.parse(decodeURIComponent(encodedPayload));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, data: string) => {
        const event = `event: ${type}\ndata: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`;
        controller.enqueue(encoder.encode(event));
      };

      const handleClose = (code: number) => {
        send('complete', `Process exited with code ${code}`);
        controller.close();
      };

      switch (action) {
        case 'create_code':
        case 'gen_tests': {
          const prompt = buildPrompt(action, payload);
          streamClaudeCode(
            prompt,
            (data) => send('output', data),
            (data) => send('error', data),
            handleClose,
            payload.workingDirectory
          );
          break;
        }

        case 'run_tests': {
          spawnStreamingProcess(
            'npm',
            ['test'],
            (data) => send('output', data),
            (data) => send('error', data),
            handleClose,
            payload.workingDirectory
          );
          break;
        }

        case 'run_app': {
          spawnStreamingProcess(
            'npm',
            ['run', 'dev'],
            (data) => send('output', data),
            (data) => send('error', data),
            handleClose,
            payload.workingDirectory
          );
          break;
        }

        default:
          send('error', `Streaming not supported for action: ${action}`);
          controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function buildPrompt(
  action: RpcAction,
  payload: { specContent?: string; adrContext?: string }
): string {
  const adrSection = payload.adrContext
    ? `## Architecture Context (ADR)\n${payload.adrContext}\n\n`
    : '';

  if (action === 'create_code') {
    return `You are implementing code based on the following specification.

${adrSection}## Specification
${payload.specContent}

## Instructions
1. Implement the code according to the specification
2. Follow best practices and the architectural decisions outlined above
3. Create necessary files and directories
4. Do NOT commit any changes - git operations are handled manually by the user`;
  }

  return `You are generating tests based on the following specification.

${adrSection}## Specification
${payload.specContent}

## Instructions
1. Generate comprehensive tests for the specified functionality
2. Include unit tests, integration tests where appropriate
3. Follow the testing conventions established in the project
4. Do NOT commit any changes - git operations are handled manually by the user`;
}
