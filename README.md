# SpecStudio

AI-powered Spec-Driven Development IDE for macOS and Linux.

<p align="center">
  <img src="docs/screenshot.png" alt="SpecStudio Screenshot" width="800">
</p>

## Overview

SpecStudio is a native desktop IDE designed for **Spec-Driven Development** — write specifications first, then let AI generate the implementation. It combines Google Gemini for intelligent chat and validation with Claude Code CLI for code generation, all within a polished Electron-based interface.

### Key Features

- **Workspace Management** — Manage multiple project workspaces with native OS folder picker
- **Spec Editor** — Write and edit specifications with auto-save
- **ADR Context** — Load Architecture Decision Records to guide AI responses
- **Gemini Chat** — Context-aware AI assistant for discussing your specs
- **Claude Code Generation** — Generate production code and tests from specs
- **Streaming Output** — Real-time console output with clean formatting (ANSI codes stripped)
- **Persistent Settings** — GCP Project ID and preferences stored locally via electron-store
- **Interactive Tour** — Guided onboarding for new users
- **Manual Git Control** — You decide when to commit (no auto-commits)

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Desktop** | Electron 40 |
| **Framework** | Next.js 16 (App Router + Turbopack) |
| **Language** | TypeScript (Strict mode) |
| **UI** | React 19 + Tailwind CSS 4 + shadcn/ui |
| **AI Chat** | Google Gemini 1.5 Pro (via Vertex AI) |
| **AI Code Gen** | Claude Code CLI |
| **Storage** | electron-store (persistent settings) |
| **Git** | simple-git (manual control) |

## Getting Started

### Prerequisites

1. **Node.js** v18 or higher
2. **Google Cloud CLI** (`gcloud`) — [Install guide](https://cloud.google.com/sdk/docs/install)
3. **Claude Code CLI** — [Install guide](https://docs.anthropic.com/claude-code)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/specstudio.git
cd specstudio

# Install dependencies
npm install --legacy-peer-deps
```

### Configuration

**Option 1: In-App Settings (Recommended for Desktop)**

On first launch, SpecStudio will prompt you to configure your Google Cloud Project ID via the Settings dialog. Click the gear icon in the top-right corner to access settings at any time.

**Option 2: Environment Variables (Web Mode)**

For development in web mode, create an environment file:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and set your Google Cloud Project ID:

```env
NEXT_PUBLIC_GCP_PROJECT_ID=your-gcp-project-id
```

### Authentication

SpecStudio uses local application-default credentials — no API keys stored in the app.

```bash
# 1. Authenticate with Google Cloud
gcloud auth application-default login

# 2. Authenticate with Anthropic (Claude)
claude login
```

## Running SpecStudio

### Desktop App (Electron)

```bash
# Development mode
npm run dev:electron

# Build for your platform
npm run build:electron

# Build for specific platforms
npm run build:electron:mac    # macOS (.dmg)
npm run build:electron:linux  # Linux (.AppImage, .deb)
```

### Web Mode (Development Only)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### 1. Configure Settings

On first launch in the desktop app, the Settings dialog will open automatically if your GCP Project ID is not configured. Enter your Google Cloud Project ID to enable Gemini chat features. You can access settings anytime by clicking the gear icon (⚙️) in the top-right corner.

### 2. Select a Workspace

On the welcome screen, click **"Connect Your First Workspace"** and either:
- Type a path manually, or
- Click the folder icon to use the native file picker (Electron only)

### 3. Write Your Spec

The left panel contains a markdown editor. Write your feature specification:

```markdown
# User Authentication

## Overview
Implement JWT-based authentication with refresh tokens.

## Requirements
- Email/password login
- Token refresh endpoint
- Secure password hashing (bcrypt)

## Acceptance Criteria
- [ ] Users can register with email/password
- [ ] Users can login and receive JWT
- [ ] Tokens expire after 15 minutes
- [ ] Refresh tokens last 7 days
```

### 4. Load ADR Context (Optional)

Click an Architecture Decision Record in the left sidebar to provide context for AI operations. ADRs are loaded from `docs/adr/` in your workspace.

### 5. Use AI Actions

The control bar provides these actions:

| Action | Description |
|--------|-------------|
| **Validate** | Gemini reviews your spec for completeness and clarity |
| **Create Code** | Claude generates implementation code |
| **Gen Tests** | Claude generates test files |
| **Run Tests** | Executes `npm test` in your workspace |
| **Run App** | Starts `npm run dev` in your workspace |

### 6. Chat with Gemini

Use the chat panel to discuss your spec, ask questions, or refine requirements. The selected ADR provides context for all conversations.

## Project Structure

```
specstudio/
├── electron/
│   ├── main.js           # Electron main process & IPC handlers
│   └── preload.js        # Context bridge (window.electron API)
├── src/
│   ├── app/
│   │   ├── api/          # Next.js API routes (web mode only)
│   │   │   ├── auth/     # Authentication endpoints
│   │   │   ├── rpc/      # RPC + streaming endpoints
│   │   │   └── workspace/# Workspace validation & file I/O
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── auth/         # Auth splash screen
│   │   ├── ide/          # Main IDE components
│   │   │   ├── adr-sidebar.tsx
│   │   │   ├── control-bar.tsx
│   │   │   ├── ide-layout.tsx
│   │   │   ├── ide-tour.tsx
│   │   │   ├── output-console.tsx
│   │   │   └── settings-dialog.tsx
│   │   ├── ui/           # shadcn/ui components
│   │   └── workspace/    # Editor, chat, workspace splash
│   ├── hooks/
│   │   ├── use-auth.ts           # Auth state management
│   │   ├── use-rpc.ts            # RPC & streaming hooks
│   │   ├── use-workspace.ts      # Workspace file operations
│   │   └── use-workspace-target.ts # Multi-workspace management
│   ├── lib/
│   │   └── services/     # Backend services (Gemini, Claude, Shell)
│   └── types/            # TypeScript definitions
├── build/                # Electron builder resources
└── package.json
```

## Architecture

### Electron Mode
```
┌─────────────────────────────────────────────────────┐
│                  Electron Main Process              │
│  ┌───────────────────────────────────────────────┐  │
│  │  IPC Handlers (auth, workspace, rpc, settings)│  │
│  │  ├── Gemini/Vertex AI calls                   │  │
│  │  ├── Claude CLI spawning                      │  │
│  │  ├── Filesystem operations                    │  │
│  │  └── electron-store (persistent settings)     │  │
│  └───────────────────────────────────────────────┘  │
│                        ▲                            │
│                        │ IPC                        │
│                        ▼                            │
│  ┌───────────────────────────────────────────────┐  │
│  │           Renderer (React/Next.js)            │  │
│  │  window.electron.* API via preload.js         │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Web Mode (Development)
```
┌─────────────────┐      ┌─────────────────────────┐
│  Browser/React  │ ──── │  Next.js API Routes     │
│  fetch('/api/*')│      │  ├── /api/auth          │
└─────────────────┘      │  ├── /api/rpc           │
                         │  ├── /api/rpc/stream    │
                         │  └── /api/workspace     │
                         └─────────────────────────┘
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server (web mode) |
| `npm run dev:electron` | Start Electron + Next.js dev server |
| `npm run build` | Build Next.js for production |
| `npm run build:electron` | Build Electron app for current platform |
| `npm run build:electron:mac` | Build macOS .dmg |
| `npm run build:electron:linux` | Build Linux .AppImage and .deb |
| `npm run lint` | Run ESLint |

## ADR Format

Place your Architecture Decision Records in `docs/adr/` within your workspace:

```markdown
---
title: Use TypeScript for Type Safety
status: accepted
---

# ADR-001: Use TypeScript for Type Safety

## Context
We need consistent type safety across the codebase...

## Decision
We will use TypeScript in strict mode...

## Consequences
- Better IDE support and autocompletion
- Compile-time error detection
- Slightly longer build times
```

## Git Control

SpecStudio enforces **strict manual git control**. The application never commits automatically — you decide when changes are ready.

```bash
# Review changes
git status
git diff

# Commit when ready
git add .
git commit -m "feat: implement user authentication"
git push
```

## Troubleshooting

### Linux Sandbox Error
If you see a sandbox error on Linux:
```
The SUID sandbox helper binary was found, but is not configured correctly.
```

The dev script includes `--no-sandbox` for development. For production, either:
1. Set up the Chrome sandbox properly, or
2. Run with `--no-sandbox` flag

### PATH Not Found (Claude/gcloud commands fail)
SpecStudio uses `fix-path` to inherit your terminal's PATH. If commands still fail:
1. Ensure `claude` and `gcloud` are in your PATH
2. Try launching from terminal: `npm run dev:electron`

### React 19 Peer Dependency Warnings
Use `--legacy-peer-deps` when installing:
```bash
npm install --legacy-peer-deps
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License — see [LICENSE](LICENSE) for details.

---

Built with Gemini, Claude, and Electron.
