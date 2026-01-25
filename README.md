# SpecStudio

AI-powered Spec-Driven Development IDE for macOS and Linux.

<p align="center">
  <img src="docs/screenshot.png" alt="SpecStudio Screenshot" width="800">
</p>

## Overview

SpecStudio is a native desktop IDE designed for **Spec-Driven Development** — write specifications first, then let AI generate the implementation. It combines Google Gemini for intelligent chat and validation with Claude Code CLI for code generation, all within a polished Tauri-based interface.

### Key Features

- **Workspace Management** — Manage multiple project workspaces with native OS folder picker
- **Spec Editor** — Write and edit specifications with auto-save
- **ADR Context** — Load Architecture Decision Records to guide AI responses
- **Gemini Chat** — Context-aware AI assistant for discussing your specs
- **Claude Code Generation** — Generate production code and tests from specs
- **Streaming Output** — Real-time console output with clean formatting
- **Browser-Based Auth** — One-click login with Google and Anthropic
- **Persistent Settings** — Preferences stored locally via tauri-plugin-store
- **Interactive Tour** — Guided onboarding for new users
- **Manual Git Control** — You decide when to commit (no auto-commits)

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Desktop** | Tauri 2 (Rust backend) |
| **Framework** | Next.js 16 (Static Export) |
| **Package Manager** | Bun |
| **Language** | TypeScript + Rust |
| **UI** | React 19 + Tailwind CSS 4 + shadcn/ui |
| **AI Chat** | Google Gemini 1.5 (via Vertex AI) |
| **AI Code Gen** | Claude Code CLI |
| **Storage** | tauri-plugin-store |

## Getting Started

### Prerequisites

1. **Bun** — [Install guide](https://bun.sh/docs/installation)
2. **Rust** — [Install guide](https://rustup.rs/)
3. **Claude Code CLI** — [Install guide](https://docs.anthropic.com/claude-code)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/specstudio.git
cd specstudio

# Install dependencies
bun install
```

### OAuth Setup (Required for Distribution)

SpecStudio uses browser-based OAuth for authentication. Users simply click "Login with Google" or "Login with Anthropic" and authenticate through their browser.

To enable this, you need to create OAuth applications and set the credentials at **build time**:

#### 1. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth client ID**
5. Select **Desktop app** as application type
6. Note the **Client ID** and **Client Secret**

#### 2. Anthropic OAuth Setup

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Navigate to developer/OAuth settings
3. Create a new OAuth application
4. Set redirect URI to `http://127.0.0.1:23847`
5. Note the **Client ID** and **Client Secret**

#### 3. Build with Credentials

```bash
# Set environment variables before building
export GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-google-client-secret"
export ANTHROPIC_CLIENT_ID="your-anthropic-client-id"
export ANTHROPIC_CLIENT_SECRET="your-anthropic-client-secret"

# Build the app
bun tauri:build
```

For development without OAuth (auth will show error messages):
```bash
bun tauri:dev
```

## Running SpecStudio

### Development

```bash
# Start Tauri dev server (hot reload)
bun tauri:dev
```

### Production Build

```bash
# Build for your platform
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx \
ANTHROPIC_CLIENT_ID=xxx ANTHROPIC_CLIENT_SECRET=xxx \
bun tauri:build
```

Build outputs are in `src-tauri/target/release/bundle/`.

## Usage

### 1. Authenticate

On first launch, click **"Login with Google"** or **"Login with Anthropic"**:
- Your browser opens to the OAuth consent screen
- Sign in with your existing account
- Authorize SpecStudio
- You'll see "Authentication Successful!" — close the browser tab
- You're now logged in!

### 2. Configure Settings

Click the gear icon (⚙️) in the top-right corner and enter your **Google Cloud Project ID**. This is required for Gemini chat features.

### 3. Select a Workspace

On the welcome screen, click **"Connect Your First Workspace"** and either:
- Type a path manually, or
- Click the folder icon to use the native file picker

### 4. Write Your Spec

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

### 5. Load ADR Context (Optional)

Click an Architecture Decision Record in the left sidebar to provide context for AI operations. ADRs are loaded from `docs/adr/` in your workspace.

### 6. Use AI Actions

The control bar provides these actions:

| Action | Description |
|--------|-------------|
| **Validate** | Gemini reviews your spec for completeness and clarity |
| **Create Code** | Claude generates implementation code |
| **Gen Tests** | Claude generates test files |
| **Run Tests** | Executes `npm test` in your workspace |
| **Run App** | Starts `npm run dev` in your workspace |

### 7. Chat with Gemini

Use the chat panel to discuss your spec, ask questions, or refine requirements. The selected ADR provides context for all conversations.

## Project Structure

```
specstudio/
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs        # Tauri app entry, plugin registration
│   │   ├── auth.rs       # OAuth flow (Google + Anthropic)
│   │   ├── gemini.rs     # Gemini API with streaming
│   │   ├── shell.rs      # Process spawning & streaming output
│   │   └── workspace.rs  # Workspace file I/O
│   ├── capabilities/     # Tauri permissions
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
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
│   │   ├── use-auth.ts           # Auth state (OAuth)
│   │   ├── use-rpc.ts            # RPC & streaming hooks
│   │   ├── use-workspace.ts      # Workspace file operations
│   │   └── use-workspace-target.ts
│   └── types/
├── out/                  # Next.js static export
└── package.json
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri (Rust Backend)                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Commands (invoke handlers)                            │  │
│  │  ├── auth.rs      → OAuth flow, token management       │  │
│  │  ├── gemini.rs    → Gemini API streaming               │  │
│  │  ├── shell.rs     → Claude CLI, npm processes          │  │
│  │  └── workspace.rs → File I/O, ADR parsing              │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  Plugins                                               │  │
│  │  ├── tauri-plugin-store  → Persistent settings         │  │
│  │  ├── tauri-plugin-shell  → Process spawning            │  │
│  │  └── tauri-plugin-dialog → Native file picker          │  │
│  └────────────────────────────────────────────────────────┘  │
│                            ▲                                  │
│                            │ IPC (invoke/listen)              │
│                            ▼                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              WebView (React/Next.js SSG)               │  │
│  │  @tauri-apps/api → invoke(), listen()                  │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun dev` | Start Next.js dev server (frontend only) |
| `bun build` | Build Next.js static export |
| `bun tauri:dev` | Start Tauri + Next.js dev server |
| `bun tauri:build` | Build Tauri app for current platform |
| `bun lint` | Run ESLint |

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

### OAuth "Not Configured" Error

If you see "Google OAuth not configured" or similar:
- OAuth credentials must be set at **build time** via environment variables
- For development, auth features won't work without credentials
- See [OAuth Setup](#oauth-setup-required-for-distribution) above

### Claude CLI Not Found

Ensure Claude Code CLI is installed and in your PATH:
```bash
# Verify installation
claude --version

# If not found, install it
# See: https://docs.anthropic.com/claude-code
```

### Gemini Chat Not Working

1. Ensure you're authenticated with Google (click "Login with Google")
2. Verify your GCP Project ID is set in Settings
3. Check that Vertex AI API is enabled in your GCP project

### Linux Build Issues

Install required system dependencies:
```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
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

Built with Gemini, Claude, Tauri, and Rust.
