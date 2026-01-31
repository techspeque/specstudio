# SpecStudio

AI-powered ISPC (Intent Spec Plan Code) Development IDE for macOS and Linux.

## Overview

SpecStudio is a native desktop IDE designed for **Intent** and **Spec-Driven Development** — a structured workflow that enforces Intent → Spec → Plan → Code. It combines Google Gemini for intelligent planning and codebase exploration with Claude Code CLI for implementation, all within a polished Tauri-based interface.

### Key Features

**Core Workflow**

- **Spec-First Pipeline** — Enforced workflow: Chat (Intent) → Spec (Markdown) → Plan (JSON) → Code
- **Dual-View Interface** — Toggle between Spec Editor and Execution Plan views
- **Plan Persistence** — Development plans stored as companion `.plan.json` files alongside specs
- **Sequential Execution** — Plans broken into phases/tickets executed one at a time

**AI Integration**

- **Gemini Architect** — Context-aware AI assistant with codebase search via tool calling
- **Tool Calling Support** — Gemini can search your codebase with `search_files` tool
- **Claude Code Generation** — Production code and tests generated from structured tickets
- **Quality Gates** — Automatic code review after each ticket execution

**Workspace Features**

- **Multiple Workspaces** — Manage multiple project workspaces with native OS folder picker
- **Spec Management** — Create, edit, delete specs with auto-save (2s debounce)
- **File Explorer** — Browse workspace with git status indicators
- **Diff Viewer** — Review changes before committing
- **Git Integration** — Revert changes, manual commits, status tracking

**Storage & Context**

- **Hidden Storage** — Specs stored in `.specstudio/specs/` (travels with git)
- **Context Isolation** — AI excluded from reading its own plans (prevents hallucinations)
- **Workspace Context** — Gemini receives filtered codebase context (respects .gitignore)
- **Token Tracking** — Real-time context usage monitoring with warnings

**UX Polish**

- **Streaming Output** — Real-time console output with interactive input support
- **Persistent Settings** — Gemini API key and model preferences stored locally
- **Interactive Tour** — Guided onboarding for new users
- **Manual Git Control** — You decide when to commit (no auto-commits)

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Desktop** | Tauri 2 (Rust backend) |
| **Framework** | Next.js 16 (Static Export, Turbopack) |
| **Package Manager** | Bun |
| **Language** | TypeScript + Rust |
| **UI** | React 19 + Tailwind CSS 4 + shadcn/ui |
| **AI Architect** | Google Gemini 2.5 (via AI Studio API) |
| **AI Code Gen** | Claude Code CLI (Anthropic) |
| **Storage** | tauri-plugin-store + File System |
| **Search** | ignore crate (gitignore-aware walking) |

## Getting Started

### Prerequisites

1. **Bun** — [Install guide](https://bun.sh/docs/installation)
2. **Rust** — [Install guide](https://rustup.rs/)
3. **Claude Code CLI** — [Install guide](https://docs.anthropic.com/claude-code)

### Installation

```bash
# Clone the repository
git clone https://github.com/techspeque/specstudio.git
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

### 4. The Spec-First Workflow

SpecStudio enforces a structured development pipeline:

#### Step 1: Intent (Chat with Gemini)

Use the **Design Assistant** chat panel to discuss your feature:

```text
User: I need to build a user authentication system with JWT tokens
Gemini: Let me search your codebase to understand existing patterns...
```

Gemini can search your workspace using the `search_files` tool to understand existing architecture.

#### Step 2: Generate Spec (Markdown)

Once you've discussed the feature, click the green **Gen Spec** button (FilePlus icon) to generate a structured markdown specification:

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

## Technical Notes
Use existing database connection from src/db.ts
```

Specs are auto-saved to `.specstudio/specs/YYYYMMDD-feature-name.md`.

You can also create specs manually with the **+** button in the Spec Sidebar.

#### Step 3: Create Development Plan (JSON)

With a spec selected, click **Validate** to review it with Gemini, then click **Create Plan** to generate a structured execution plan with phases and tickets.

The plan is automatically saved to `.specstudio/specs/YYYYMMDD-feature-name.plan.json` and persists across sessions.

Switch to **📋 Execution Plan** view to see the structured breakdown.

#### Step 4: Execute Tickets

In the Plan View, click **Execute Plan** to run the next pending ticket. Each ticket:

1. Gets sent to Claude Code with specific requirements
2. Claude implements the code
3. Quality gate runs (Gemini reviews the diff)
4. Ticket marked as done, next ticket starts

### 5. Control Bar Actions

The control bar changes based on your current view:

**Spec View (📄 Spec Editor)**

| Action | Description |
|--------|-------------|
| **Validate** | Gemini reviews your spec for completeness |
| **Create Plan** | Generate JSON development plan from spec |

**Plan View (📋 Execution Plan)**

| Action | Description |
|--------|-------------|
| **Execute Plan** | Execute next pending ticket sequentially |
| **Run Tests** | Execute tests in your workspace |
| **Run App** | Start development server in your workspace |

**Git Controls (Always Visible)**

| Action | Description |
|--------|-------------|
| **Undo Changes** | Revert all changes made by Claude (shown after execution) |
| **Manual Commit** | Review diffs and commit manually |

### 6. File Explorer & Diff Viewer

Toggle the **File Explorer** (folder icon in top bar) to:

- Browse workspace files
- See git status indicators (modified files highlighted)
- Click files to view diffs in the Diff Viewer

### 7. Interactive Console

When Claude Code runs, you can interact with it via the console input at the bottom. Type responses and press Enter to send input to the running process.

## Project Structure

```
specstudio/
├── .specstudio/          # Hidden folder (user workspaces)
│   └── specs/            # Specs and plans (YYYYMMDD-name.md, .plan.json)
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs        # Tauri app entry, plugin registration
│   │   ├── auth.rs       # Browser-based OAuth (deprecated)
│   │   ├── deps.rs       # Dependency checker (claude CLI)
│   │   ├── gemini.rs     # Gemini API with streaming + tool calling
│   │   ├── shell.rs      # Process spawning & interactive I/O
│   │   ├── workspace.rs  # Spec/plan file I/O (.specstudio/specs/)
│   │   ├── search.rs     # File search (search_files, search_file_names)
│   │   ├── filetree.rs   # File tree with .gitignore support
│   │   └── git.rs        # Git operations (status, diff, revert)
│   ├── capabilities/     # Tauri permissions
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ide/
│   │   │   ├── ide-layout.tsx          # Main orchestrator
│   │   │   ├── control-bar.tsx         # Dynamic action buttons
│   │   │   ├── spec-sidebar.tsx        # Spec list + creation
│   │   │   ├── plan-viewer.tsx         # Execution plan display
│   │   │   ├── file-explorer.tsx       # Workspace file browser
│   │   │   ├── diff-viewer.tsx         # Git diff display
│   │   │   ├── active-spec-indicator.tsx # Top bar spec display
│   │   │   ├── output-console.tsx      # Streaming output
│   │   │   ├── settings-dialog.tsx     # Gemini API config
│   │   │   └── ide-tour.tsx            # Onboarding
│   │   ├── setup/
│   │   │   └── setup-wizard.tsx        # First-launch setup
│   │   ├── ui/           # shadcn/ui components
│   │   └── workspace/
│   │       ├── spec-editor.tsx         # Markdown editor
│   │       └── chat-panel.tsx          # Gemini chat UI
│   ├── hooks/
│   │   ├── use-auth.ts                 # Auth state (deprecated)
│   │   ├── use-rpc.ts                  # RPC + chat with tool calling
│   │   ├── use-workspace.ts            # Spec/plan CRUD + persistence
│   │   └── use-workspace-target.ts     # Workspace selection
│   ├── lib/utils/
│   │   └── tokens.ts                   # Token estimation
│   └── types/
│       └── index.ts                    # TypeScript definitions
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

## Tool Calling Architecture

SpecStudio implements Gemini's function calling API to let the AI search your codebase:

**How it works:**

1. User asks: "How is authentication currently implemented?"
2. Gemini decides to call `search_files` tool with `{query: "authentication", max_results: 50}`
3. Frontend intercepts `tool_call` event from backend
4. Frontend executes `invoke('search_files', args)` on Tauri backend
5. Search results formatted as: `Tool Output [search_files]: {results...}`
6. Results automatically sent back to Gemini to continue generation

**Supported Tools:**

- `search_files(query, max_results)` — Search file contents (respects .gitignore)
- `search_file_names(query, max_results)` — Search by filename only

**Implementation Details:**

- Backend: `src-tauri/src/gemini.rs` defines tool schemas
- Backend: `src-tauri/src/search.rs` implements search using `ignore` crate
- Frontend: `src/hooks/use-rpc.ts` (useChat hook) handles tool call loop
- Event flow: `tool_call` → `invoke()` → `chat_with_gemini()` with results

## Plan Persistence Architecture

Development plans are persisted to disk and automatically loaded with specs:

**Storage Pattern:**

- Spec: `.specstudio/specs/20260131-feature.md`
- Plan: `.specstudio/specs/20260131-feature.plan.json`

**Lifecycle:**

1. **Create Plan**: `handleCreatePlan()` generates JSON from spec, calls `savePlan()` immediately
2. **Auto-Save**: Plan updates (ticket status changes) auto-saved after 1s debounce
3. **Load Plan**: `selectSpec()` automatically loads companion `.plan.json` if exists
4. **State Management**: `use-workspace.ts` hook manages both spec content and development plan

**Implementation:**

- `use-workspace.ts:selectSpec()` — Loads both `.md` and `.plan.json` files
- `use-workspace.ts:savePlan()` — Persists plan to companion JSON file
- `use-workspace.ts:setDevelopmentPlan()` — Supports function updaters + auto-save
- `ide-layout.tsx` — Consumes plan from workspace hook instead of local state

This ensures plans survive page reloads and travel with code in git.

## Storage Architecture

SpecStudio stores specs and plans in a hidden `.specstudio/specs/` directory within your workspace:

```
your-project/
├── .specstudio/
│   └── specs/
│       ├── 20260131-user-auth.md          # Markdown spec
│       ├── 20260131-user-auth.plan.json   # JSON development plan
│       ├── 20260201-api-refactor.md
│       └── 20260201-api-refactor.plan.json
├── src/
├── package.json
└── ...
```

**Benefits:**

- Plans travel with your code in git
- Hidden folder keeps project root clean
- Companion files (`.md` + `.plan.json`) stay synchronized
- Excluded from AI context to prevent hallucinations

**Add to .gitignore if needed:**

```gitignore
# Optionally exclude local dev plans
.specstudio/
```

## Git Control

SpecStudio enforces **strict manual git control**. The application never commits automatically — you decide when changes are ready.

**Undo Changes Feature:**
After Claude executes a ticket, an **Undo Changes** button appears. Click it to revert all changes made by the AI using `git restore`.

**Manual Commit Flow:**

```bash
# Review changes in the File Explorer or Diff Viewer
# Click the GitHub icon to commit manually

# Or use terminal:
git status
git diff

# Commit when ready
git add .
git commit -m "feat: implement user authentication"
git push
```

## Architecture Highlights

### Spec-First Enforcement

The UI enforces the workflow through state management:

- **activeView**: Toggles between 'spec' and 'plan' views
- **Control Bar**: Dynamically shows different actions based on activeView
- **Plan Tab**: Disabled until a plan is generated from a spec
- This prevents users from skipping ahead to code generation without planning

### Context Isolation

The `EXCLUDED_DIRS` list in `workspace.rs` is critical:

```rust
const EXCLUDED_DIRS: &[&str] = &[
    ".specstudio", // CRITICAL: Prevents AI from reading its own plan JSONs
    "node_modules",
    ".git",
    // ... other excluded dirs
];
```

Without this, Gemini would read its own plans as "code context" and hallucinate recursive improvements.

### Auto-Save Patterns

Two auto-save mechanisms with different timing:

- **Specs**: 2-second debounce (allow user to type)
- **Plans**: 1-second debounce (faster save for structural changes)

Both use `setTimeout` with cleanup on unmount and cancel on new edits.

### Streaming Event Architecture

```typescript
// Backend emits events
emit_stream_event(app, "output", "Generated code...")
emit_stream_event(app, "tool_call", "{name: 'search_files', args: {...}}")
emit_stream_event(app, "complete", "Done")

// Frontend listens and handles
listen('rpc:stream:data', (event) => {
  if (event.type === 'output') { /* accumulate text */ }
  if (event.type === 'tool_call') { /* execute tool */ }
  if (event.type === 'complete') { /* finalize or continue */ }
})
```

This enables real-time updates, interactive input, and tool calling without blocking the UI.

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

1. Verify your API key is entered correctly in Settings (gear icon in top bar)
2. Get a new API key from [Google AI Studio](https://aistudio.google.com/apikey) if needed
3. Check you have selected a valid model in Settings (gemini-2.5-flash or gemini-2.5-pro)
4. If tool calling hangs, check console for `search_files` errors

### Tool Calling Issues

If Gemini hangs when trying to search the codebase:

1. Check that the workspace path is valid and accessible
2. Verify .gitignore is properly configured (large node_modules can slow search)
3. Check browser console for `invoke('search_files')` errors

### Plan Not Persisting

If your development plan disappears after reload:

1. Ensure the selected spec has a companion `.plan.json` file in `.specstudio/specs/`
2. Check console for `save_spec` errors
3. Verify workspace has write permissions for `.specstudio/` directory

### Linux Build Issues

Install required system dependencies:

```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

## Contributing

1. Clone the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License — see [LICENSE](LICENSE) for details.

---

Built with Gemini, Claude, Tauri, and Rust.
