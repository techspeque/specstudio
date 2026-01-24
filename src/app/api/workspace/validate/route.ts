// ============================================================================
// Workspace Validation API Route
// Validates and optionally creates workspace directories
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { stat, mkdir } from 'fs/promises';
import { resolve, isAbsolute } from 'path';

interface ValidateResponse {
  valid: boolean;
  path?: string;
  error?: string;
  created?: boolean;
}

/**
 * POST /api/workspace/validate - Validate a workspace path
 */
export async function POST(request: NextRequest): Promise<NextResponse<ValidateResponse>> {
  try {
    const body = await request.json();
    const { path: inputPath } = body;

    if (!inputPath || typeof inputPath !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'Path is required' },
        { status: 400 }
      );
    }

    // Ensure absolute path
    if (!isAbsolute(inputPath)) {
      return NextResponse.json(
        { valid: false, error: 'Path must be absolute (e.g., /home/user/projects/my-app)' },
        { status: 400 }
      );
    }

    const resolvedPath = resolve(inputPath);

    // Security: Prevent targeting sensitive system directories
    const forbiddenPaths = [
      '/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64',
      '/boot', '/dev', '/proc', '/sys', '/run', '/var',
      '/root', '/snap',
    ];

    for (const forbidden of forbiddenPaths) {
      if (resolvedPath === forbidden || resolvedPath.startsWith(forbidden + '/')) {
        return NextResponse.json(
          { valid: false, error: 'Cannot use system directories as workspace' },
          { status: 400 }
        );
      }
    }

    // Check if directory exists
    try {
      const stats = await stat(resolvedPath);
      if (!stats.isDirectory()) {
        return NextResponse.json(
          { valid: false, error: 'Path exists but is not a directory' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        valid: true,
        path: resolvedPath,
        created: false,
      });
    } catch (err) {
      // Directory doesn't exist - create it
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        try {
          await mkdir(resolvedPath, { recursive: true });
          return NextResponse.json({
            valid: true,
            path: resolvedPath,
            created: true,
          });
        } catch (mkdirErr) {
          return NextResponse.json(
            { valid: false, error: `Failed to create directory: ${(mkdirErr as Error).message}` },
            { status: 400 }
          );
        }
      }

      return NextResponse.json(
        { valid: false, error: `Cannot access path: ${(err as Error).message}` },
        { status: 400 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { valid: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
