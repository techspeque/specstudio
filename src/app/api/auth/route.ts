// ============================================================================
// Auth API Route
// Handles browser-based authentication for Google Cloud and Anthropic
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { executeCommand } from '@/lib/services/shell';
import { AuthProvider, AuthResponse, AuthStatus } from '@/types';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * GET /api/auth - Check authentication status for both providers
 */
export async function GET(): Promise<NextResponse<AuthStatus>> {
  const [googleStatus, anthropicStatus] = await Promise.all([
    checkGoogleAuth(),
    checkAnthropicAuth(),
  ]);

  return NextResponse.json({
    google: googleStatus,
    anthropic: anthropicStatus,
  });
}

/**
 * POST /api/auth - Trigger browser-based login for a provider
 */
export async function POST(request: NextRequest): Promise<NextResponse<AuthResponse>> {
  const body = await request.json();
  const provider = body.provider as AuthProvider;

  if (!provider || !['google', 'anthropic'].includes(provider)) {
    return NextResponse.json(
      {
        success: false,
        provider: provider ?? 'google',
        message: 'Invalid provider. Use "google" or "anthropic".',
      },
      { status: 400 }
    );
  }

  try {
    if (provider === 'google') {
      return NextResponse.json(await triggerGoogleLogin());
    } else {
      return NextResponse.json(await triggerAnthropicLogin());
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        provider,
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * Check if Google Cloud ADC is configured
 */
async function checkGoogleAuth(): Promise<boolean> {
  try {
    // Check for application default credentials (5 second timeout)
    const result = await executeCommand(
      'gcloud auth application-default print-access-token 2>/dev/null',
      undefined,
      5000
    );
    return result.exitCode === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if Anthropic (Claude) CLI is authenticated
 * Uses file-based check for speed (claude config list can be slow)
 */
async function checkAnthropicAuth(): Promise<boolean> {
  try {
    // Check if Claude config file exists (fast file-based check)
    const claudeConfigPath = join(homedir(), '.claude.json');
    return existsSync(claudeConfigPath);
  } catch {
    return false;
  }
}

/**
 * Trigger Google Cloud application-default login
 */
async function triggerGoogleLogin(): Promise<AuthResponse> {
  const result = await executeCommand('gcloud auth application-default login');

  if (result.exitCode === 0) {
    return {
      success: true,
      provider: 'google',
      message: 'Google Cloud authentication successful',
    };
  }

  return {
    success: false,
    provider: 'google',
    message: result.stderr || 'Google Cloud authentication failed',
  };
}

/**
 * Trigger Anthropic Claude CLI login
 */
async function triggerAnthropicLogin(): Promise<AuthResponse> {
  const result = await executeCommand('claude login');

  if (result.exitCode === 0) {
    return {
      success: true,
      provider: 'anthropic',
      message: 'Anthropic authentication successful',
    };
  }

  return {
    success: false,
    provider: 'anthropic',
    message: result.stderr || 'Anthropic authentication failed',
  };
}
