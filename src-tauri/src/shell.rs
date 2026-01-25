// ============================================================================
// Shell Commands
// Handles process spawning and streaming output via Tauri Events
// ============================================================================

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, ChildStdout, ChildStderr, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub data: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnResult {
    pub started: bool,
    pub process_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelResult {
    pub success: bool,
}

// ============================================================================
// Process Registry
// Tracks active streaming processes for cancellation
// ============================================================================

pub struct ProcessRegistry {
    processes: Mutex<HashMap<String, Arc<Mutex<Option<std::process::Child>>>>>,
}

impl ProcessRegistry {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, id: String, child: std::process::Child) -> Arc<Mutex<Option<std::process::Child>>> {
        let handle = Arc::new(Mutex::new(Some(child)));
        self.processes.lock().unwrap().insert(id, handle.clone());
        handle
    }

    pub fn remove(&self, id: &str) {
        self.processes.lock().unwrap().remove(id);
    }

    pub fn kill_all(&self) -> usize {
        let mut killed = 0;
        let mut registry = self.processes.lock().unwrap();
        for (_, handle) in registry.drain() {
            if let Ok(mut guard) = handle.lock() {
                if let Some(ref mut child) = *guard {
                    let _ = child.kill();
                    killed += 1;
                }
            }
        }
        killed
    }
}

impl Default for ProcessRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn get_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn emit_stream_event(app: &AppHandle, event_type: &str, data: &str) {
    let event = StreamEvent {
        event_type: event_type.to_string(),
        data: data.to_string(),
        timestamp: get_timestamp(),
    };
    let _ = app.emit("rpc:stream:data", event);
}

/// Stream stdout bytes to the frontend without waiting for newlines.
/// Uses a small buffer and emits chunks as they arrive.
fn stream_stdout(mut stdout: ChildStdout, app: AppHandle) {
    let mut buffer = [0u8; 256];
    loop {
        match stdout.read(&mut buffer) {
            Ok(0) => break, // EOF
            Ok(n) => {
                let text = String::from_utf8_lossy(&buffer[..n]);
                emit_stream_event(&app, "output", &text);
            }
            Err(_) => break,
        }
    }
}

/// Stream stderr bytes to the frontend without waiting for newlines.
fn stream_stderr(mut stderr: ChildStderr, app: AppHandle) {
    let mut buffer = [0u8; 256];
    loop {
        match stderr.read(&mut buffer) {
            Ok(0) => break, // EOF
            Ok(n) => {
                let text = String::from_utf8_lossy(&buffer[..n]);
                emit_stream_event(&app, "error", &text);
            }
            Err(_) => break,
        }
    }
}

/// Build the prompt for Claude based on action type
fn build_prompt(action: &str, spec_content: &str, adr_context: Option<&str>) -> String {
    let adr_section = adr_context
        .map(|ctx| format!("## Architecture Context (ADR)\n{}\n\n", ctx))
        .unwrap_or_default();

    if action == "create_code" {
        format!(
            r#"You are implementing code based on the following specification.

{}## Specification
{}

## Instructions
1. Implement the code according to the specification
2. Follow best practices and the architectural decisions outlined above
3. Create necessary files and directories
4. Do NOT commit any changes - git operations are handled manually by the user"#,
            adr_section, spec_content
        )
    } else {
        format!(
            r#"You are generating tests based on the following specification.

{}## Specification
{}

## Instructions
1. Generate comprehensive tests for the specified functionality
2. Include unit tests, integration tests where appropriate
3. Follow the testing conventions established in the project
4. Do NOT commit any changes - git operations are handled manually by the user"#,
            adr_section, spec_content
        )
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub fn spawn_streaming_process(
    app: AppHandle,
    action: String,
    working_directory: Option<String>,
    spec_content: Option<String>,
    adr_context: Option<String>,
) -> Result<SpawnResult, String> {
    let cwd = working_directory
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let process_id = format!("proc_{}", get_timestamp());

    // Get the process registry
    let registry = app.state::<ProcessRegistry>();

    emit_stream_event(&app, "output", &format!("Starting {}...", action));

    match action.as_str() {
        "create_code" | "gen_tests" => {
            let spec = spec_content.ok_or("specContent is required for this action")?;
            let prompt = build_prompt(&action, &spec, adr_context.as_deref());

            // Write prompt to temp file
            let temp_dir = std::env::temp_dir();
            let temp_path = temp_dir.join(format!("specstudio_prompt_{}.txt", process_id));

            fs::write(&temp_path, &prompt)
                .map_err(|e| format!("Failed to write temp prompt file: {}", e))?;

            // Spawn claude process
            let mut cmd = Command::new("claude");
            cmd.args(["-p", temp_path.to_str().unwrap(), "--dangerously-skip-permissions"])
                .current_dir(&cwd)
                .env("FORCE_COLOR", "0")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            let mut child = cmd.spawn()
                .map_err(|e| format!("Failed to spawn claude: {}", e))?;

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            let proc_id = process_id.clone();
            let handle = registry.register(proc_id.clone(), child);

            // Spawn thread to read stdout (byte-based, doesn't block on newlines)
            let app_stdout = app.clone();
            let stdout_thread = if let Some(stdout) = stdout {
                Some(thread::spawn(move || {
                    stream_stdout(stdout, app_stdout);
                }))
            } else {
                None
            };

            // Spawn thread to read stderr (byte-based, doesn't block on newlines)
            let app_stderr = app.clone();
            let stderr_thread = if let Some(stderr) = stderr {
                Some(thread::spawn(move || {
                    stream_stderr(stderr, app_stderr);
                }))
            } else {
                None
            };

            // Spawn thread to wait for completion
            let app_complete = app.clone();
            let temp_path_clone = temp_path.clone();

            thread::spawn(move || {
                // Wait for reader threads
                if let Some(t) = stdout_thread {
                    let _ = t.join();
                }
                if let Some(t) = stderr_thread {
                    let _ = t.join();
                }

                // Get exit code
                let exit_code = if let Ok(mut guard) = handle.lock() {
                    if let Some(ref mut child) = *guard {
                        child.wait().map(|s| s.code().unwrap_or(-1)).unwrap_or(-1)
                    } else {
                        -1
                    }
                } else {
                    -1
                };

                // Cleanup - get registry from app handle inside the thread
                let registry = app_complete.state::<ProcessRegistry>();
                registry.remove(&proc_id);
                let _ = fs::remove_file(&temp_path_clone);

                emit_stream_event(
                    &app_complete,
                    "complete",
                    &format!("Process exited with code {}", exit_code),
                );
            });

            Ok(SpawnResult {
                started: true,
                process_id,
            })
        }

        "run_tests" => {
            spawn_npm_command(&app, &registry, &process_id, &cwd, &["test"])
        }

        "run_app" => {
            spawn_npm_command(&app, &registry, &process_id, &cwd, &["run", "dev"])
        }

        _ => {
            emit_stream_event(&app, "error", &format!("Unknown streaming action: {}", action));
            Err(format!("Unknown streaming action: {}", action))
        }
    }
}

fn spawn_npm_command(
    app: &AppHandle,
    registry: &ProcessRegistry,
    process_id: &str,
    cwd: &PathBuf,
    args: &[&str],
) -> Result<SpawnResult, String> {
    let mut cmd = Command::new("npm");
    cmd.args(args)
        .current_dir(cwd)
        .env("FORCE_COLOR", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn npm: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let proc_id = process_id.to_string();
    let handle = registry.register(proc_id.clone(), child);

    // Spawn thread to read stdout (byte-based, doesn't block on newlines)
    let app_stdout = app.clone();
    let stdout_thread = if let Some(stdout) = stdout {
        Some(thread::spawn(move || {
            stream_stdout(stdout, app_stdout);
        }))
    } else {
        None
    };

    // Spawn thread to read stderr (byte-based, doesn't block on newlines)
    let app_stderr = app.clone();
    let stderr_thread = if let Some(stderr) = stderr {
        Some(thread::spawn(move || {
            stream_stderr(stderr, app_stderr);
        }))
    } else {
        None
    };

    // Spawn thread to wait for completion
    let app_complete = app.clone();
    let proc_id_clone = proc_id.clone();

    // We need to clone the registry state differently
    let app_for_registry = app.clone();

    thread::spawn(move || {
        // Wait for reader threads
        if let Some(t) = stdout_thread {
            let _ = t.join();
        }
        if let Some(t) = stderr_thread {
            let _ = t.join();
        }

        // Get exit code
        let exit_code = if let Ok(mut guard) = handle.lock() {
            if let Some(ref mut child) = *guard {
                child.wait().map(|s| s.code().unwrap_or(-1)).unwrap_or(-1)
            } else {
                -1
            }
        } else {
            -1
        };

        // Cleanup
        let registry = app_for_registry.state::<ProcessRegistry>();
        registry.remove(&proc_id_clone);

        emit_stream_event(
            &app_complete,
            "complete",
            &format!("Process exited with code {}", exit_code),
        );
    });

    Ok(SpawnResult {
        started: true,
        process_id: proc_id,
    })
}

#[tauri::command]
pub fn cancel_streaming_processes(app: AppHandle) -> CancelResult {
    let registry = app.state::<ProcessRegistry>();
    let killed = registry.kill_all();

    log::info!("Cancelled {} streaming processes", killed);

    CancelResult { success: true }
}
