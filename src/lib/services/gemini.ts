// ============================================================================
// Gemini Service (via Vertex AI)
// Handles chat and validation using gemini-1.5-pro
// ============================================================================

import { VertexAI, Content, Part } from '@google-cloud/vertexai';
import { ChatMessage } from '@/types';
import { readFile, readdir, stat } from 'fs/promises';
import { join, extname } from 'path';

const MODEL_ID = 'gemini-1.5-pro';

// File extensions to include when reading the codebase
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.css', '.scss', '.html',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.yaml', '.yml', '.toml', '.env.example',
]);

// Directories to exclude when reading the codebase
const EXCLUDED_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'build',
  '.cache', 'coverage', '.nyc_output', '__pycache__',
  '.venv', 'venv', 'vendor', '.turbo',
]);

// Files to exclude
const EXCLUDED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.DS_Store', 'Thumbs.db',
]);

function getVertexAI(): VertexAI {
  const projectId = process.env.NEXT_PUBLIC_GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error('NEXT_PUBLIC_GCP_PROJECT_ID environment variable is not set');
  }
  return new VertexAI({
    project: projectId,
    location: 'us-central1',
  });
}

function convertToVertexContent(messages: ChatMessage[]): Content[] {
  return messages.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }] as Part[],
  }));
}

/**
 * Send a chat message with history context
 */
export async function chat(
  prompt: string,
  history: ChatMessage[] = [],
  systemContext?: string
): Promise<string> {
  const vertexAI = getVertexAI();
  const generativeModel = vertexAI.getGenerativeModel({
    model: MODEL_ID,
    systemInstruction: systemContext
      ? { role: 'system', parts: [{ text: systemContext }] }
      : undefined,
  });

  const chatSession = generativeModel.startChat({
    history: convertToVertexContent(history),
  });

  const result = await chatSession.sendMessage(prompt);
  const response = result.response;

  if (!response.candidates?.[0]?.content?.parts?.[0]) {
    throw new Error('No response from Gemini');
  }

  const part = response.candidates[0].content.parts[0];
  if ('text' in part && part.text) {
    return part.text;
  }

  throw new Error('Unexpected response format from Gemini');
}

/**
 * Validate spec content for completeness and clarity
 * Optionally reads the project codebase for context
 */
export async function validateSpec(
  specContent: string,
  adrContext?: string,
  workingDirectory?: string
): Promise<string> {
  // Read project codebase for validation context
  let codebaseContext = '';
  if (workingDirectory) {
    try {
      codebaseContext = await readCodebase(workingDirectory);
    } catch {
      // Continue without codebase context if reading fails
    }
  }

  const systemPrompt = `You are an expert software architect reviewing specifications.
Analyze the provided specification for:
1. Completeness - Are all necessary details included?
2. Clarity - Is the language unambiguous?
3. Consistency - Are there any contradictions?
4. Feasibility - Are the requirements technically achievable?
5. Testability - Can the requirements be verified?

${adrContext ? `Consider this ADR context:\n${adrContext}\n` : ''}
${codebaseContext ? `\nCurrent project codebase for reference:\n${codebaseContext}\n` : ''}

Provide a structured review with specific recommendations for improvement.
Consider how the specification fits with the existing codebase architecture.`;

  return chat(specContent, [], systemPrompt);
}

/**
 * Stream a chat response (for real-time output)
 */
export async function* streamChat(
  prompt: string,
  history: ChatMessage[] = [],
  systemContext?: string
): AsyncGenerator<string> {
  const vertexAI = getVertexAI();
  const generativeModel = vertexAI.getGenerativeModel({
    model: MODEL_ID,
    systemInstruction: systemContext
      ? { role: 'system', parts: [{ text: systemContext }] }
      : undefined,
  });

  const chatSession = generativeModel.startChat({
    history: convertToVertexContent(history),
  });

  const streamingResult = await chatSession.sendMessageStream(prompt);

  for await (const chunk of streamingResult.stream) {
    const text = chunk.candidates?.[0]?.content?.parts?.[0];
    if (text && 'text' in text && text.text) {
      yield text.text;
    }
  }
}

/**
 * Read the project codebase into a single text string
 * Excludes node_modules, .next, .git, and other common directories
 */
async function readCodebase(rootDir: string, maxSize = 500000): Promise<string> {
  const files: { path: string; content: string }[] = [];
  let totalSize = 0;

  async function walkDir(dir: string, relativePath = ''): Promise<void> {
    if (totalSize >= maxSize) return;

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (totalSize >= maxSize) break;

      const fullPath = join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        await walkDir(fullPath, relPath);
      } else if (entry.isFile()) {
        // Skip excluded files
        if (EXCLUDED_FILES.has(entry.name)) continue;

        // Only include files with code extensions
        const ext = extname(entry.name).toLowerCase();
        if (!CODE_EXTENSIONS.has(ext)) continue;

        try {
          const fileStat = await stat(fullPath);
          // Skip files larger than 50KB
          if (fileStat.size > 50000) continue;

          const content = await readFile(fullPath, 'utf-8');
          const fileEntry = `\n--- ${relPath} ---\n${content}\n`;

          if (totalSize + fileEntry.length <= maxSize) {
            files.push({ path: relPath, content });
            totalSize += fileEntry.length;
          }
        } catch {
          // Skip files that can't be read
          continue;
        }
      }
    }
  }

  await walkDir(rootDir);

  // Format as a single string
  return files
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n');
}
