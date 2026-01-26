// ============================================================================
// Git Commands
// Provides git status, revert, and file history operations
// ============================================================================

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub is_git_repo: bool,
    pub has_changes: bool,
    pub changed_files: Vec<String>,
    pub untracked_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRevertResult {
    pub success: bool,
    pub message: String,
    pub reverted_files: usize,
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Get git status for a working directory
#[tauri::command]
pub fn git_status(working_directory: String) -> Result<GitStatusResult, String> {
    let cwd = Path::new(&working_directory);

    if !cwd.exists() || !cwd.is_dir() {
        return Err("Working directory does not exist".to_string());
    }

    // Check if it's a git repo
    let git_dir = cwd.join(".git");
    if !git_dir.exists() {
        return Ok(GitStatusResult {
            is_git_repo: false,
            has_changes: false,
            changed_files: Vec::new(),
            untracked_files: Vec::new(),
        });
    }

    // Run git status --porcelain to get machine-readable output
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git status failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut changed_files: Vec<String> = Vec::new();
    let mut untracked_files: Vec<String> = Vec::new();

    for line in stdout.lines() {
        if line.len() < 3 {
            continue;
        }

        let status = &line[0..2];
        let file = line[3..].trim().to_string();

        if status.starts_with("??") {
            untracked_files.push(file);
        } else {
            changed_files.push(file);
        }
    }

    let has_changes = !changed_files.is_empty() || !untracked_files.is_empty();

    Ok(GitStatusResult {
        is_git_repo: true,
        has_changes,
        changed_files,
        untracked_files,
    })
}

/// Revert all changes in the working directory
/// This runs: git clean -fd && git checkout .
#[tauri::command]
pub fn git_revert_all(working_directory: String) -> Result<GitRevertResult, String> {
    let cwd = Path::new(&working_directory);

    if !cwd.exists() || !cwd.is_dir() {
        return Err("Working directory does not exist".to_string());
    }

    // First, get the count of files that will be reverted
    let status = git_status(working_directory.clone())?;
    if !status.is_git_repo {
        return Err("Not a git repository".to_string());
    }

    if !status.has_changes {
        return Ok(GitRevertResult {
            success: true,
            message: "No changes to revert".to_string(),
            reverted_files: 0,
        });
    }

    let total_files = status.changed_files.len() + status.untracked_files.len();

    // Run git checkout . to revert tracked files
    let checkout_output = Command::new("git")
        .args(["checkout", "."])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git checkout: {}", e))?;

    if !checkout_output.status.success() {
        let stderr = String::from_utf8_lossy(&checkout_output.stderr);
        return Err(format!("git checkout failed: {}", stderr));
    }

    // Run git clean -fd to remove untracked files
    let clean_output = Command::new("git")
        .args(["clean", "-fd"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git clean: {}", e))?;

    if !clean_output.status.success() {
        let stderr = String::from_utf8_lossy(&clean_output.stderr);
        return Err(format!("git clean failed: {}", stderr));
    }

    Ok(GitRevertResult {
        success: true,
        message: format!("Reverted {} files", total_files),
        reverted_files: total_files,
    })
}

/// Get file content at a specific git ref (commit, HEAD, etc.)
#[tauri::command]
pub fn git_show_file(
    working_directory: String,
    file_path: String,
    git_ref: String,
) -> Result<String, String> {
    let cwd = Path::new(&working_directory);

    if !cwd.exists() || !cwd.is_dir() {
        return Err("Working directory does not exist".to_string());
    }

    // Run git show {ref}:{path}
    let output = Command::new("git")
        .args(["show", &format!("{}:{}", git_ref, file_path)])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git show: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // If file doesn't exist in the ref, return empty string
        if stderr.contains("does not exist") || stderr.contains("path") {
            return Ok(String::new());
        }
        return Err(format!("git show failed: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Read current file content from disk
#[tauri::command]
pub fn read_file(working_directory: String, file_path: String) -> Result<String, String> {
    let cwd = Path::new(&working_directory);
    let full_path = cwd.join(&file_path);

    if !full_path.exists() {
        return Ok(String::new());
    }

    std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}
