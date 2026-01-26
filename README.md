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
- **Streaming Output** — Real-time console output with interactive input
- **Browser-Based Auth** — One-click login with Google
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

### Building

```bash
# Development
bun tauri:dev

# Production build
bun tauri:build
```

Build outputs are in `src-tauri/target/release/bundle/`.

To run the built app:
```bash
# macOS
open src-tauri/target/release/bundle/macos/SpecStudio.app
```

## Usage

### 1. First Launch Setup

On first launch, SpecStudio guides you through a quick setup:

1. **Get a Gemini API Key**
   - Go to [Google AI Studio](https://aistudio.google.com/apikey)
   - Sign in with your Google account
   - Click **Create API Key** and copy it
   - Paste it in the setup wizard

2. **Install Claude Code CLI**
   - Follow the installation guide at [Claude Code](https://docs.anthropic.com/claude-code)

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

### 7. Interactive Console

When Claude Code runs, you can interact with it via the console input at the bottom. Type responses and press Enter to send input.

### 8. Chat with Gemini

Use the chat panel to discuss your spec, ask questions, or refine requirements. The selected ADR provides context for all conversations.

## Project Structure

```
specstudio/
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs        # Tauri app entry, plugin registration
│   │   ├── auth.rs       # Browser-based OAuth
│   │   ├── deps.rs       # Dependency checker
│   │   ├── gemini.rs     # Gemini API with streaming
│   │   ├── shell.rs      # Process spawning & interactive I/O
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
│   │   ├── setup/        # Setup wizard
│   │   ├── ui/           # shadcn/ui components
│   │   └── workspace/    # Editor, chat, workspace splash
│   ├── hooks/
│   │   ├── use-auth.ts           # Auth state management
│   │   ├── use-rpc.ts            # RPC & streaming hooks
│   │   └── use-workspace.ts      # Workspace file operations
│   └── types/
├── out/                  # Next.js static export
└── package.json
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

### Claude CLI Not Found

Ensure Claude Code CLI is installed and in your PATH:
```bash
# Verify installation
claude --version

# If not found, install it
# See: https://docs.anthropic.com/claude-code
```

### Gemini Chat Not Working

1. Verify your API key is entered correctly in Settings
2. Get a new API key from [Google AI Studio](https://aistudio.google.com/apikey) if needed
3. Check you have selected a valid model in Settings

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
