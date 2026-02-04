// ============================================================================
// Shell Commands (Updated)
// - Added ~/.local/bin to search paths
// - Added deep logging for process spawning debug
// ============================================================================

use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, ChildStderr, Command, Stdio};
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputResult {
    pub success: bool,
    pub message: String,
}

// ============================================================================
// Process Registry
// ============================================================================

enum ProcessWriter {
    Pty(Arc<Mutex<Option<Box<dyn Write + Send>>>>),
    Stdin(Arc<Mutex<Option<ChildStdin>>>),
}

struct ProcessHandle {
    writer: ProcessWriter,
    child_pid: Option<u32>,
}

pub struct ProcessRegistry {
    processes: Mutex<HashMap<String, ProcessHandle>>,
}

impl ProcessRegistry {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }

    pub fn register_pty(&self, id: String, pty_writer: Box<dyn Write + Send>, child_pid: Option<u32>) {
        let writer_handle = Arc::new(Mutex::new(Some(pty_writer)));
        self.processes.lock().unwrap().insert(id, ProcessHandle {
            writer: ProcessWriter::Pty(writer_handle),
            child_pid,
        });
    }

    pub fn register(&self, id: String, mut child: Child) -> Arc<Mutex<Option<ChildStdin>>> {
        let stdin = child.stdin.take();
        let child_pid = child.id();
        let stdin_handle = Arc::new(Mutex::new(stdin));

        self.processes.lock().unwrap().insert(id, ProcessHandle {
            writer: ProcessWriter::Stdin(stdin_handle.clone()),
            child_pid: Some(child_pid),
        });

        // Child is moved here and needs to be kept alive elsewhere
        // Return stdin handle for the spawn_npm_command to manage
        stdin_handle
    }

    pub fn get_stdin(&self, id: &str) -> Option<Arc<Mutex<Option<ChildStdin>>>> {
        self.processes.lock().unwrap()
            .get(id)
            .and_then(|h| match &h.writer {
                ProcessWriter::Stdin(s) => Some(s.clone()),
                ProcessWriter::Pty(_) => None,
            })
    }

    pub fn get_pty_writer(&self, id: &str) -> Option<Arc<Mutex<Option<Box<dyn Write + Send>>>>> {
        self.processes.lock().unwrap()
            .get(id)
            .and_then(|h| match &h.writer {
                ProcessWriter::Pty(w) => Some(w.clone()),
                ProcessWriter::Stdin(_) => None,
            })
    }

    pub fn remove(&self, id: &str) {
        self.processes.lock().unwrap().remove(id);
    }

    pub fn kill_all(&self) -> usize {
        let mut killed = 0;
        let mut registry = self.processes.lock().unwrap();
        for (_, handle) in registry.drain() {
            if let Some(pid) = handle.child_pid {
                #[cfg(unix)]
                {
                    use std::process::Command;
                    // Kill the process group to ensure all child processes are terminated
                    let _ = Command::new("kill")
                        .arg("-9")
                        .arg(format!("{}", pid))
                        .spawn();
                    killed += 1;
                }
                #[cfg(not(unix))]
                {
                    log::warn!("Process termination not implemented for this platform");
                }
            }
        }
        killed
    }

    pub fn get_active_process_id(&self) -> Option<String> {
        self.processes.lock().unwrap()
            .keys()
            .next()
            .cloned()
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

/// Robustly find a binary in common macOS/Linux locations
pub fn resolve_binary_path(binary_name: &str) -> String {
    let home = dirs::home_dir().unwrap_or_default();
    
    // Convert paths to Strings to avoid lifetime issues
    let local_bin = home.join(".local/bin").to_string_lossy().to_string(); // Added for your setup
    let bun_path = home.join(".bun/bin").to_string_lossy().to_string();
    let npm_global_path = home.join(".npm-global/bin").to_string_lossy().to_string();
    let cargo_path = home.join(".cargo/bin").to_string_lossy().to_string();

    let search_paths = [
        local_bin.as_str(), // Check user local bin first
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
        bun_path.as_str(),
        npm_global_path.as_str(),
        cargo_path.as_str(),
    ];

    log::info!("Searching for binary '{}' in standard paths...", binary_name);

    for path in search_paths {
        if path.is_empty() { continue; }
        let bin_path = std::path::Path::new(path).join(binary_name);
        if bin_path.exists() {
            log::info!("Found binary at: {}", bin_path.display());
            return bin_path.to_string_lossy().to_string();
        }
    }

    log::warn!("Binary '{}' not found in search paths, falling back to system lookup", binary_name);
    binary_name.to_string()
}

/// Construct a PATH string that includes user tools
pub fn get_robust_path_env() -> String {
    let existing_path = std::env::var("PATH").unwrap_or_default();
    let home = dirs::home_dir().unwrap_or_default();

    let local_bin = home.join(".local/bin").to_string_lossy().to_string();
    let bun_path = home.join(".bun/bin").to_string_lossy().to_string();
    let npm_global_path = home.join(".npm-global/bin").to_string_lossy().to_string();
    let cargo_path = home.join(".cargo/bin").to_string_lossy().to_string();

    let extra_paths = vec![
        local_bin.as_str(),
        "/opt/homebrew/bin",
        "/usr/local/bin",
        bun_path.as_str(),
        npm_global_path.as_str(),
        cargo_path.as_str(),
    ];
    
    let joined_extras = extra_paths.join(":");
    format!("{}:{}", joined_extras, existing_path)
}

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
    // Log errors to backend log as well
    if event_type == "error" {
        log::error!("Stream Error: {}", data);
    }
    let _ = app.emit("rpc:stream:data", event);
}

fn stream_stdout(mut stdout: ChildStdout, app: AppHandle) {
    let mut buffer = [0u8; 1024]; // Increased buffer size
    loop {
        match stdout.read(&mut buffer) {
            Ok(0) => break, 
            Ok(n) => {
                let text = String::from_utf8_lossy(&buffer[..n]);
                // Log output trace for debugging (verbose)
                log::trace!("STDOUT: {}", text);
                emit_stream_event(&app, "output", &text);
            }
            Err(e) => {
                log::error!("Error reading stdout: {}", e);
                break;
            }
        }
    }
}

fn stream_stderr(mut stderr: ChildStderr, app: AppHandle) {
    let mut buffer = [0u8; 1024];
    loop {
        match stderr.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                let text = String::from_utf8_lossy(&buffer[..n]);
                log::info!("STDERR: {}", text); // Log stderr as info to catch prompt questions
                emit_stream_event(&app, "error", &text);
            }
            Err(e) => {
                log::error!("Error reading stderr: {}", e);
                break;
            }
        }
    }
}

fn build_prompt(action: &str, spec_content: &str) -> String {
    if action == "create_code" {
        format!(
            r#"You are implementing code based on the following specification.

## Specification
{}

## Instructions
1. Implement the code according to the specification
2. Follow best practices
3. Create necessary files and directories
4. Do NOT commit any changes - git operations are handled manually by the user"#,
            spec_content
        )
    } else {
        format!(
            r#"You are generating tests based on the following specification.

## Specification
{}

## Instructions
1. Generate comprehensive tests for the specified functionality
2. Include unit tests, integration tests where appropriate
3. Follow the testing conventions established in the project
4. Do NOT commit any changes - git operations are handled manually by the user"#,
            spec_content
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
) -> Result<SpawnResult, String> {
    let cwd = working_directory
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let process_id = format!("proc_{}", get_timestamp());
    let registry = app.state::<ProcessRegistry>();

    log::info!("--- SPATTERING PROCESS START ---");
    log::info!("Action: {}", action);
    log::info!("CWD: {}", cwd.display());

    match action.as_str() {
        "create_code" | "gen_tests" => {
            let spec = spec_content.ok_or("specContent is required for this action")?;
            let prompt = build_prompt(&action, &spec);

            let temp_dir = std::env::temp_dir();
            let temp_path = temp_dir.join(format!("specstudio_prompt_{}.txt", process_id));

            log::info!("Writing prompt to: {}", temp_path.display());
            fs::write(&temp_path, &prompt)
                .map_err(|e| format!("Failed to write temp prompt file: {}", e))?;

            // Resolve paths
            let claude_path = resolve_binary_path("claude");
            let robust_path = get_robust_path_env();

            log::info!("Using Claude Binary: {}", claude_path);
            log::info!("Using PATH Env: {}", robust_path);

            // Create PTY system
            let pty_system = native_pty_system();

            // Create a PTY pair
            let pty_pair = pty_system
                .openpty(PtySize {
                    rows: 24,
                    cols: 80,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Failed to create PTY: {}", e))?;

            // Build the command
            let mut cmd = CommandBuilder::new(&claude_path);
            cmd.arg("-p");
            cmd.arg(temp_path.to_str().unwrap());
            cmd.arg("--dangerously-skip-permissions");
            cmd.cwd(&cwd);
            cmd.env("PATH", robust_path);
            cmd.env("FORCE_COLOR", "1");
            cmd.env("TERM", "xterm-256color");

            log::info!("Spawning claude via PTY...");

            // Spawn the child process attached to the slave PTY
            let mut child = pty_pair
                .slave
                .spawn_command(cmd)
                .map_err(|e| {
                    log::error!("Failed to spawn claude via PTY: {}", e);
                    format!("Failed to spawn claude: {}", e)
                })?;

            let child_pid = child.process_id();
            log::info!("Process spawned successfully. PID: {:?}", child_pid);
            emit_stream_event(&app, "output", &format!("Process started (PID: {:?})\n", child_pid.unwrap_or(0)));

            // Get the master PTY reader and writer
            let mut reader = pty_pair.master.try_clone_reader()
                .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;
            let writer = pty_pair.master.take_writer()
                .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

            let proc_id = process_id.clone();
            registry.register_pty(proc_id.clone(), writer, child_pid);

            // Spawn thread to read PTY output and stream to frontend
            let app_reader = app.clone();
            let reader_thread = thread::spawn(move || {
                let mut buffer = [0u8; 4096];
                loop {
                    match reader.read(&mut buffer) {
                        Ok(0) => {
                            log::info!("PTY reader reached EOF");
                            break;
                        }
                        Ok(n) => {
                            let text = String::from_utf8_lossy(&buffer[..n]);
                            log::trace!("PTY OUTPUT: {}", text);
                            emit_stream_event(&app_reader, "output", &text);
                        }
                        Err(e) => {
                            log::error!("Error reading from PTY: {}", e);
                            break;
                        }
                    }
                }
            });

            // Spawn thread to wait for process exit
            let app_complete = app.clone();
            let temp_path_clone = temp_path.clone();

            thread::spawn(move || {
                // Wait for reader thread to finish (indicates process has closed PTY)
                let _ = reader_thread.join();

                // Wait for the child process to exit
                let exit_code = match child.wait() {
                    Ok(status) => status.exit_code(),
                    Err(e) => {
                        log::error!("Error waiting for process: {}", e);
                        1 // Use 1 as error exit code instead of -1
                    }
                };

                log::info!("Process {} exited with code {}", proc_id, exit_code);

                // Cleanup
                if let Ok(registry) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    app_complete.state::<ProcessRegistry>()
                })) {
                    registry.remove(&proc_id);
                }
                let _ = fs::remove_file(&temp_path_clone);
                emit_stream_event(&app_complete, "complete", &format!("Process exited with code {}", exit_code));
            });

            Ok(SpawnResult { started: true, process_id })
        }
        
        "run_tests" | "run_app" => {
            // Similar logging added to npm commands if needed, 
            // but sticking to claude focus for now.
             spawn_npm_command(&app, &registry, &process_id, &cwd, 
                if action == "run_tests" { &["test"] } else { &["run", "dev"] }
             )
        }

        _ => Err(format!("Unknown streaming action: {}", action))
    }
}

fn spawn_npm_command(
    app: &AppHandle,
    _registry: &ProcessRegistry,
    process_id: &str,
    cwd: &PathBuf,
    args: &[&str],
) -> Result<SpawnResult, String> {
    let npm_path = resolve_binary_path("npm");
    let robust_path = get_robust_path_env();

    log::info!("Spawning NPM: {} {:?}", npm_path, args);

    let mut cmd = Command::new(&npm_path);
    cmd.args(args)
        .current_dir(cwd)
        .env("PATH", robust_path)
        .env("FORCE_COLOR", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn npm: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let proc_id = process_id.to_string();

    let app_stdout = app.clone();
    let stdout_thread = if let Some(stdout) = stdout {
        Some(thread::spawn(move || stream_stdout(stdout, app_stdout)))
    } else { None };

    let app_stderr = app.clone();
    let stderr_thread = if let Some(stderr) = stderr {
        Some(thread::spawn(move || stream_stderr(stderr, app_stderr)))
    } else { None };

    let app_complete = app.clone();

    thread::spawn(move || {
        if let Some(t) = stdout_thread { let _ = t.join(); }
        if let Some(t) = stderr_thread { let _ = t.join(); }

        let exit_code = match child.wait() {
            Ok(status) => status.code().unwrap_or(-1),
            Err(e) => {
                log::error!("Error waiting for npm process: {}", e);
                -1
            }
        };

        emit_stream_event(&app_complete, "complete", &format!("Process exited with code {}", exit_code));
    });

    Ok(SpawnResult { started: true, process_id: proc_id })
}

#[tauri::command]
pub fn send_process_input(app: AppHandle, input: String) -> Result<InputResult, String> {
    let registry = app.state::<ProcessRegistry>();
    let process_id = registry.get_active_process_id().ok_or("No active process")?;

    log::info!("Sending input to process {}: {}", process_id, input);

    let input_with_newline = format!("{}\n", input);

    // Try PTY writer first
    if let Some(writer_handle) = registry.get_pty_writer(&process_id) {
        let mut writer_guard = writer_handle.lock().map_err(|_| "Failed to lock PTY writer")?;
        if let Some(ref mut writer) = *writer_guard {
            writer.write_all(input_with_newline.as_bytes()).map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;
            emit_stream_event(&app, "input", &format!("> {}\n", input));
            return Ok(InputResult { success: true, message: "Input sent to PTY".to_string() });
        }
    }

    // Try stdin writer
    if let Some(stdin_handle) = registry.get_stdin(&process_id) {
        let mut stdin_guard = stdin_handle.lock().map_err(|_| "Failed to lock stdin")?;
        if let Some(ref mut stdin) = *stdin_guard {
            stdin.write_all(input_with_newline.as_bytes()).map_err(|e| e.to_string())?;
            stdin.flush().map_err(|e| e.to_string())?;
            emit_stream_event(&app, "input", &format!("> {}\n", input));
            return Ok(InputResult { success: true, message: "Input sent to stdin".to_string() });
        }
    }

    Err("Process writer unavailable".to_string())
}

#[tauri::command]
pub fn cancel_streaming_processes(app: AppHandle) -> CancelResult {
    let registry = app.state::<ProcessRegistry>();
    let killed = registry.kill_all();
    log::info!("Cancelled {} streaming processes", killed);
    CancelResult { success: true }
}