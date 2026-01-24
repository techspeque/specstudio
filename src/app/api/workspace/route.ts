// ============================================================================
// Workspace API Route
// Handles reading/writing spec.md and ADRs from the local filesystem
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { ADR } from '@/types';

const SPEC_FILE = 'spec.md';
const ADR_DIR = 'docs/adr';

const DEFAULT_SPEC_CONTENT = `# Feature Specification

## Overview
Describe the feature or component you want to build.

## Requirements
- Requirement 1
- Requirement 2
- Requirement 3

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Technical Notes
Add any implementation details or constraints here.
`;

interface WorkspaceResponse {
  specContent: string;
  adrs: ADR[];
  workingDirectory: string;
}

/**
 * GET /api/workspace - Read spec.md and ADRs
 */
export async function GET(request: NextRequest): Promise<NextResponse<WorkspaceResponse | { error: string }>> {
  const searchParams = request.nextUrl.searchParams;
  const workingDirectory = searchParams.get('cwd') ?? process.cwd();

  try {
    const [specContent, adrs] = await Promise.all([
      readSpec(workingDirectory),
      readADRs(workingDirectory),
    ]);

    return NextResponse.json({
      specContent,
      adrs,
      workingDirectory,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspace - Save spec.md
 */
export async function POST(request: NextRequest): Promise<NextResponse<{ success: boolean; error?: string }>> {
  try {
    const body = await request.json();
    const { specContent, workingDirectory } = body;

    if (typeof specContent !== 'string') {
      return NextResponse.json(
        { success: false, error: 'specContent is required' },
        { status: 400 }
      );
    }

    const cwd = workingDirectory ?? process.cwd();
    const specPath = join(cwd, SPEC_FILE);

    await writeFile(specPath, specContent, 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * Read spec.md from the working directory
 * Creates default spec if it doesn't exist
 */
async function readSpec(workingDirectory: string): Promise<string> {
  const specPath = join(workingDirectory, SPEC_FILE);

  if (!existsSync(specPath)) {
    // Create default spec file
    await writeFile(specPath, DEFAULT_SPEC_CONTENT, 'utf-8');
    return DEFAULT_SPEC_CONTENT;
  }

  return readFile(specPath, 'utf-8');
}

/**
 * Read all ADR markdown files from docs/adr/
 * Parses frontmatter or headers to extract metadata
 */
async function readADRs(workingDirectory: string): Promise<ADR[]> {
  const adrPath = join(workingDirectory, ADR_DIR);

  // Create ADR directory if it doesn't exist
  if (!existsSync(adrPath)) {
    await mkdir(adrPath, { recursive: true });
    return [];
  }

  const files = await readdir(adrPath);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  const adrs: ADR[] = [];

  for (const filename of mdFiles) {
    try {
      const filePath = join(adrPath, filename);
      const content = await readFile(filePath, 'utf-8');
      const adr = parseADR(content, filename);
      if (adr) {
        adrs.push(adr);
      }
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  // Sort by ID
  return adrs.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Parse ADR content to extract metadata
 * Supports both YAML frontmatter and markdown headers
 */
function parseADR(content: string, filename: string): ADR | null {
  // Extract ID from filename (e.g., "adr-001-typescript.md" -> "adr-001")
  const idMatch = filename.match(/^(adr-\d+)/i);
  const id = idMatch ? idMatch[1].toLowerCase() : filename.replace('.md', '');

  // Try to parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const title = extractFrontmatterField(frontmatter, 'title') || extractFirstHeading(content) || filename;
    const status = extractFrontmatterField(frontmatter, 'status') as ADR['status'] || 'proposed';
    const bodyContent = content.slice(frontmatterMatch[0].length).trim();

    return {
      id,
      title,
      status: validateStatus(status),
      context: extractSection(bodyContent, 'Context') || '',
      decision: extractSection(bodyContent, 'Decision') || '',
      consequences: extractSection(bodyContent, 'Consequences') || '',
      filename,
    };
  }

  // Parse markdown headers without frontmatter
  const title = extractFirstHeading(content) || filename;

  return {
    id,
    title,
    status: extractStatusFromContent(content),
    context: extractSection(content, 'Context') || '',
    decision: extractSection(content, 'Decision') || '',
    consequences: extractSection(content, 'Consequences') || '',
    filename,
  };
}

/**
 * Extract a field from YAML frontmatter
 */
function extractFrontmatterField(frontmatter: string, field: string): string | null {
  const regex = new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'mi');
  const match = frontmatter.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract the first H1 or H2 heading from markdown
 */
function extractFirstHeading(content: string): string | null {
  const match = content.match(/^#{1,2}\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Extract a section from markdown by heading name
 */
function extractSection(content: string, sectionName: string): string | null {
  // Match "## Context" or "### Context" etc.
  const regex = new RegExp(`^#{2,3}\\s+${sectionName}[\\s\\S]*?\\n([\\s\\S]*?)(?=^#{2,3}\\s|$)`, 'mi');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Try to extract status from content (e.g., "Status: Accepted")
 */
function extractStatusFromContent(content: string): ADR['status'] {
  const statusMatch = content.match(/status:\s*(proposed|accepted|deprecated|superseded)/i);
  if (statusMatch) {
    return validateStatus(statusMatch[1]);
  }

  // Check for status in a dedicated section
  const statusSection = extractSection(content, 'Status');
  if (statusSection) {
    const status = statusSection.toLowerCase().trim();
    if (['proposed', 'accepted', 'deprecated', 'superseded'].includes(status)) {
      return status as ADR['status'];
    }
  }

  return 'proposed';
}

/**
 * Validate and normalize status value
 */
function validateStatus(status: string): ADR['status'] {
  const normalized = status.toLowerCase().trim();
  if (['proposed', 'accepted', 'deprecated', 'superseded'].includes(normalized)) {
    return normalized as ADR['status'];
  }
  return 'proposed';
}
