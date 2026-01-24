// ============================================================================
// Electron Main Process
// Handles IPC, window management, and native OS integration
// ============================================================================

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execAsync = promisify(exec);

// isDev check
let isDev = false;
try {
  isDev = require('electron-is-dev');
} catch {
  isDev = process.env.NODE_ENV === 'development';
}

// ============================================================================
// Settings Store (electron-store)
// Persists user settings like GCP Project ID
// ============================================================================

let store = null;

async function initStore() {
  try {
    const Store = (await import('electron-store')).default;
    store = new Store({
      name: 'specstudio-settings',
      defaults: {
        gcpProjectId: '',
      },
    });
  } catch (e) {
    console.error('Failed to initialize electron-store:', e.message);
  }
}

// ============================================================================
// CRITICAL: Fix PATH for macOS/Linux GUI apps
// This must be called before any process spawning
// ============================================================================

async function fixPathAsync() {
  try {
    const fixPath = await import('fix-path');
    fixPath.default();
  } catch (e) {
    console.warn('Could not fix PATH:', e.message);
  }
}

// ============================================================================
// Constants
// ============================================================================

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

// Forbidden system directories
const FORBIDDEN_PATHS = [
  '/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64',
  '/boot', '/dev', '/proc', '/sys', '/run', '/var',
  '/root', '/snap',
];

// File extensions for codebase reading
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.css', '.scss', '.html',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.yaml', '.yml', '.toml', '.env.example',
]);

// Directories to exclude when reading codebase
const EXCLUDED_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'build',
  '.cache', 'coverage', '.nyc_output', '__pycache__',
  '.venv', 'venv', 'vendor', '.turbo',
]);

const EXCLUDED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.DS_Store', 'Thumbs.db',
]);

// ============================================================================
// Window Management
// ============================================================================

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#09090b', // zinc-950
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await fixPathAsync();
  await initStore();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// ============================================================================
// Settings IPC Handlers
// ============================================================================

ipcMain.handle('settings:get', async (event, key) => {
  if (!store) {
    // Fallback to env vars in dev mode
    if (key === 'gcpProjectId') {
      return process.env.NEXT_PUBLIC_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || '';
    }
    return null;
  }
  return store.get(key);
});

ipcMain.handle('settings:set', async (event, key, value) => {
  if (!store) {
    return { success: false, error: 'Settings store not initialized' };
  }
  store.set(key, value);
  return { success: true };
});

ipcMain.handle('settings:getAll', async () => {
  if (!store) {
    return {
      gcpProjectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || '',
    };
  }
  return store.store;
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get GCP Project ID from store or environment
 */
function getGcpProjectId() {
  // First try the store
  if (store) {
    const storedId = store.get('gcpProjectId');
    if (storedId) return storedId;
  }
  // Fallback to environment variables (for dev mode)
  return process.env.NEXT_PUBLIC_GCP_PROJECT_ID || process.env.GCP_PROJECT_ID || '';
}

async function executeCommand(command, cwd, timeoutMs) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd || process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: '0' },
      timeout: timeoutMs,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.killed ? 'Command timed out' : (error.stderr || error.message),
      exitCode: error.code || 1,
    };
  }
}

function spawnStreamingProcess(command, args, cwd, eventName) {
  const child = spawn(command, args, {
    cwd: cwd || process.cwd(),
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  child.stdout?.on('data', (data) => {
    mainWindow?.webContents.send(eventName, {
      type: 'output',
      data: data.toString(),
      timestamp: Date.now(),
    });
  });

  child.stderr?.on('data', (data) => {
    mainWindow?.webContents.send(eventName, {
      type: 'error',
      data: data.toString(),
      timestamp: Date.now(),
    });
  });

  child.on('close', (code) => {
    mainWindow?.webContents.send(eventName, {
      type: 'complete',
      data: `Process exited with code ${code}`,
      timestamp: Date.now(),
    });
  });

  return child;
}

// ============================================================================
// Auth IPC Handlers
// ============================================================================

ipcMain.handle('auth:check', async () => {
  const [google, anthropic] = await Promise.all([
    checkGoogleAuth(),
    checkAnthropicAuth(),
  ]);
  return { google, anthropic };
});

ipcMain.handle('auth:login', async (event, provider) => {
  if (provider === 'google') {
    // Open Google auth in external browser
    shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth');
    // Run gcloud auth in terminal
    const result = await executeCommand('gcloud auth application-default login');
    return {
      success: result.exitCode === 0,
      provider: 'google',
      message: result.exitCode === 0 ? 'Google Cloud authentication successful' : result.stderr,
    };
  } else if (provider === 'anthropic') {
    // Run claude login
    const result = await executeCommand('claude login');
    return {
      success: result.exitCode === 0,
      provider: 'anthropic',
      message: result.exitCode === 0 ? 'Anthropic authentication successful' : result.stderr,
    };
  }
  return { success: false, provider, message: 'Invalid provider' };
});

async function checkGoogleAuth() {
  try {
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

async function checkAnthropicAuth() {
  try {
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');
    return fs.existsSync(claudeConfigPath);
  } catch {
    return false;
  }
}

// ============================================================================
// Workspace IPC Handlers
// ============================================================================

ipcMain.handle('workspace:validate', async (event, inputPath) => {
  if (!inputPath || typeof inputPath !== 'string') {
    return { valid: false, error: 'Path is required' };
  }

  if (!path.isAbsolute(inputPath)) {
    return { valid: false, error: 'Path must be absolute (e.g., /home/user/projects/my-app)' };
  }

  const resolvedPath = path.resolve(inputPath);

  // Security check
  for (const forbidden of FORBIDDEN_PATHS) {
    if (resolvedPath === forbidden || resolvedPath.startsWith(forbidden + '/')) {
      return { valid: false, error: 'Cannot use system directories as workspace' };
    }
  }

  try {
    const stats = await fs.promises.stat(resolvedPath);
    if (!stats.isDirectory()) {
      return { valid: false, error: 'Path exists but is not a directory' };
    }
    return { valid: true, path: resolvedPath, created: false };
  } catch (err) {
    if (err.code === 'ENOENT') {
      try {
        await fs.promises.mkdir(resolvedPath, { recursive: true });
        return { valid: true, path: resolvedPath, created: true };
      } catch (mkdirErr) {
        return { valid: false, error: `Failed to create directory: ${mkdirErr.message}` };
      }
    }
    return { valid: false, error: `Cannot access path: ${err.message}` };
  }
});

ipcMain.handle('workspace:read', async (event, workingDirectory) => {
  const cwd = workingDirectory || process.cwd();

  try {
    const [specContent, adrs] = await Promise.all([
      readSpec(cwd),
      readADRs(cwd),
    ]);

    return { specContent, adrs, workingDirectory: cwd };
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle('workspace:save', async (event, { specContent, workingDirectory }) => {
  if (typeof specContent !== 'string') {
    throw new Error('specContent is required');
  }

  const cwd = workingDirectory || process.cwd();
  const specPath = path.join(cwd, SPEC_FILE);

  await fs.promises.writeFile(specPath, specContent, 'utf-8');
  return { success: true };
});

ipcMain.handle('workspace:browse', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Workspace Folder',
    buttonLabel: 'Select Folder',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return { canceled: false, path: result.filePaths[0] };
});

async function readSpec(workingDirectory) {
  const specPath = path.join(workingDirectory, SPEC_FILE);

  if (!fs.existsSync(specPath)) {
    await fs.promises.writeFile(specPath, DEFAULT_SPEC_CONTENT, 'utf-8');
    return DEFAULT_SPEC_CONTENT;
  }

  return fs.promises.readFile(specPath, 'utf-8');
}

async function readADRs(workingDirectory) {
  const adrPath = path.join(workingDirectory, ADR_DIR);

  if (!fs.existsSync(adrPath)) {
    await fs.promises.mkdir(adrPath, { recursive: true });
    return [];
  }

  const files = await fs.promises.readdir(adrPath);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  const adrs = [];

  for (const filename of mdFiles) {
    try {
      const filePath = path.join(adrPath, filename);
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const adr = parseADR(content, filename);
      if (adr) {
        adrs.push(adr);
      }
    } catch {
      continue;
    }
  }

  return adrs.sort((a, b) => a.id.localeCompare(b.id));
}

function parseADR(content, filename) {
  const idMatch = filename.match(/^(adr-\d+)/i);
  const id = idMatch ? idMatch[1].toLowerCase() : filename.replace('.md', '');

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const title = extractFrontmatterField(frontmatter, 'title') || extractFirstHeading(content) || filename;
    const status = extractFrontmatterField(frontmatter, 'status') || 'proposed';
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

function extractFrontmatterField(frontmatter, field) {
  const regex = new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'mi');
  const match = frontmatter.match(regex);
  return match ? match[1].trim() : null;
}

function extractFirstHeading(content) {
  const match = content.match(/^#{1,2}\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractSection(content, sectionName) {
  const regex = new RegExp(`^#{2,3}\\s+${sectionName}[\\s\\S]*?\\n([\\s\\S]*?)(?=^#{2,3}\\s|$)`, 'mi');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractStatusFromContent(content) {
  const statusMatch = content.match(/status:\s*(proposed|accepted|deprecated|superseded)/i);
  if (statusMatch) {
    return validateStatus(statusMatch[1]);
  }

  const statusSection = extractSection(content, 'Status');
  if (statusSection) {
    const status = statusSection.toLowerCase().trim();
    if (['proposed', 'accepted', 'deprecated', 'superseded'].includes(status)) {
      return status;
    }
  }

  return 'proposed';
}

function validateStatus(status) {
  const normalized = status.toLowerCase().trim();
  if (['proposed', 'accepted', 'deprecated', 'superseded'].includes(normalized)) {
    return normalized;
  }
  return 'proposed';
}

// ============================================================================
// RPC IPC Handlers
// ============================================================================

ipcMain.handle('rpc:execute', async (event, { action, payload }) => {
  switch (action) {
    case 'chat':
      return handleChat(payload);
    case 'validate':
      return handleValidate(payload);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
});

ipcMain.handle('rpc:stream', async (event, { action, payload }) => {
  const eventName = 'rpc:stream:data';

  mainWindow?.webContents.send(eventName, {
    type: 'output',
    data: `Starting ${action}...`,
    timestamp: Date.now(),
  });

  switch (action) {
    case 'create_code':
    case 'gen_tests': {
      const prompt = buildPrompt(action, payload);
      streamClaudeCode(prompt, payload.workingDirectory, eventName);
      break;
    }
    case 'run_tests': {
      spawnStreamingProcess('npm', ['test'], payload.workingDirectory, eventName);
      break;
    }
    case 'run_app': {
      spawnStreamingProcess('npm', ['run', 'dev'], payload.workingDirectory, eventName);
      break;
    }
    default:
      mainWindow?.webContents.send(eventName, {
        type: 'error',
        data: `Unknown streaming action: ${action}`,
        timestamp: Date.now(),
      });
  }

  return { started: true };
});

// Active streaming processes
const activeProcesses = new Map();

ipcMain.handle('rpc:cancel', async () => {
  for (const [id, proc] of activeProcesses) {
    try {
      proc.kill('SIGTERM');
    } catch {
      // Ignore kill errors
    }
    activeProcesses.delete(id);
  }
  return { success: true };
});

function streamClaudeCode(prompt, workingDirectory, eventName) {
  const tempPath = path.join(os.tmpdir(), 'temp_prompt.txt');
  const cwd = workingDirectory || process.cwd();

  fs.promises.writeFile(tempPath, prompt, 'utf-8')
    .then(() => {
      const child = spawn('claude', ['-p', tempPath, '--dangerously-skip-permissions'], {
        cwd,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      const procId = Date.now().toString();
      activeProcesses.set(procId, child);

      child.stdout?.on('data', (data) => {
        mainWindow?.webContents.send(eventName, {
          type: 'output',
          data: data.toString(),
          timestamp: Date.now(),
        });
      });

      child.stderr?.on('data', (data) => {
        mainWindow?.webContents.send(eventName, {
          type: 'error',
          data: data.toString(),
          timestamp: Date.now(),
        });
      });

      child.on('close', (code) => {
        activeProcesses.delete(procId);
        fs.promises.unlink(tempPath).catch(() => {});
        mainWindow?.webContents.send(eventName, {
          type: 'complete',
          data: `Process exited with code ${code}`,
          timestamp: Date.now(),
        });
      });
    })
    .catch((err) => {
      mainWindow?.webContents.send(eventName, {
        type: 'error',
        data: `Failed to start Claude: ${err.message}`,
        timestamp: Date.now(),
      });
    });
}

function buildPrompt(action, payload) {
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

// ============================================================================
// Gemini Chat Handlers (Vertex AI)
// ============================================================================

async function handleChat(payload) {
  if (!payload.prompt) {
    throw new Error('Prompt is required for chat action');
  }

  const projectId = getGcpProjectId();
  if (!projectId) {
    throw new Error('Google Cloud Project ID is not configured. Please set it in Settings.');
  }

  const { VertexAI } = require('@google-cloud/vertexai');

  const vertexAI = new VertexAI({
    project: projectId,
    location: 'us-central1',
  });

  const systemContext = payload.adrContext
    ? `You are an AI assistant helping with spec-driven development.
Consider this architectural context:\n${payload.adrContext}`
    : undefined;

  const generativeModel = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    systemInstruction: systemContext
      ? { role: 'system', parts: [{ text: systemContext }] }
      : undefined,
  });

  const history = (payload.history || []).map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));

  const chatSession = generativeModel.startChat({ history });
  const result = await chatSession.sendMessage(payload.prompt);
  const response = result.response;

  if (!response.candidates?.[0]?.content?.parts?.[0]) {
    throw new Error('No response from Gemini');
  }

  const part = response.candidates[0].content.parts[0];
  if ('text' in part && part.text) {
    return {
      success: true,
      action: 'chat',
      data: part.text,
    };
  }

  throw new Error('Unexpected response format from Gemini');
}

async function handleValidate(payload) {
  if (!payload.specContent) {
    throw new Error('specContent is required for validate action');
  }

  const projectId = getGcpProjectId();
  if (!projectId) {
    throw new Error('Google Cloud Project ID is not configured. Please set it in Settings.');
  }

  let codebaseContext = '';
  if (payload.workingDirectory) {
    try {
      codebaseContext = await readCodebase(payload.workingDirectory);
    } catch {
      // Continue without codebase context
    }
  }

  const systemPrompt = `You are an expert software architect reviewing specifications.
Analyze the provided specification for:
1. Completeness - Are all necessary details included?
2. Clarity - Is the language unambiguous?
3. Consistency - Are there any contradictions?
4. Feasibility - Are the requirements technically achievable?
5. Testability - Can the requirements be verified?

${payload.adrContext ? `Consider this ADR context:\n${payload.adrContext}\n` : ''}
${codebaseContext ? `\nCurrent project codebase for reference:\n${codebaseContext}\n` : ''}

Provide a structured review with specific recommendations for improvement.
Consider how the specification fits with the existing codebase architecture.`;

  const { VertexAI } = require('@google-cloud/vertexai');

  const vertexAI = new VertexAI({
    project: projectId,
    location: 'us-central1',
  });

  const generativeModel = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
  });

  const chatSession = generativeModel.startChat({ history: [] });
  const result = await chatSession.sendMessage(payload.specContent);
  const response = result.response;

  if (!response.candidates?.[0]?.content?.parts?.[0]) {
    throw new Error('No response from Gemini');
  }

  const part = response.candidates[0].content.parts[0];
  if ('text' in part && part.text) {
    return {
      success: true,
      action: 'validate',
      data: part.text,
    };
  }

  throw new Error('Unexpected response format from Gemini');
}

async function readCodebase(rootDir, maxSize = 500000) {
  const files = [];
  let totalSize = 0;

  async function walkDir(dir, relativePath = '') {
    if (totalSize >= maxSize) return;

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (totalSize >= maxSize) break;

      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        await walkDir(fullPath, relPath);
      } else if (entry.isFile()) {
        if (EXCLUDED_FILES.has(entry.name)) continue;

        const ext = path.extname(entry.name).toLowerCase();
        if (!CODE_EXTENSIONS.has(ext)) continue;

        try {
          const fileStat = await fs.promises.stat(fullPath);
          if (fileStat.size > 50000) continue;

          const content = await fs.promises.readFile(fullPath, 'utf-8');
          const fileEntry = `\n--- ${relPath} ---\n${content}\n`;

          if (totalSize + fileEntry.length <= maxSize) {
            files.push({ path: relPath, content });
            totalSize += fileEntry.length;
          }
        } catch {
          continue;
        }
      }
    }
  }

  await walkDir(rootDir);

  return files
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n');
}
