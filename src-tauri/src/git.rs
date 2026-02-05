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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    pub diff: String,
    pub files_changed: usize,
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

/// Get git diff for staged changes (or specific files if provided)
/// If files is None, returns diff for all staged changes
/// If files is Some, returns diff for those specific files (staged + unstaged)
#[tauri::command]
pub fn get_staged_diff(
    working_directory: String,
    files: Option<Vec<String>>,
) -> Result<GitDiffResult, String> {
    let cwd = Path::new(&working_directory);

    if !cwd.exists() || !cwd.is_dir() {
        return Err("Working directory does not exist".to_string());
    }

    // Check if it's a git repo
    let git_dir = cwd.join(".git");
    if !git_dir.exists() {
        return Err("Not a git repository".to_string());
    }

    let output = if let Some(file_list) = files {
        if file_list.is_empty() {
            // If empty list provided, return all changes (staged + unstaged)
            Command::new("git")
                .args(["diff", "HEAD"])
                .current_dir(cwd)
                .output()
                .map_err(|e| format!("Failed to run git diff: {}", e))?
        } else {
            // Get diff for specific files (includes both staged and unstaged)
            let mut args = vec!["diff", "HEAD", "--"];
            args.extend(file_list.iter().map(|s| s.as_str()));
            Command::new("git")
                .args(&args)
                .current_dir(cwd)
                .output()
                .map_err(|e| format!("Failed to run git diff: {}", e))?
        }
    } else {
        // No files specified - get all staged changes
        // First check if there are any commits in the repo
        let rev_parse = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("Failed to check git history: {}", e))?;

        if rev_parse.status.success() {
            // Repo has commits - use diff HEAD
            Command::new("git")
                .args(["diff", "HEAD"])
                .current_dir(cwd)
                .output()
                .map_err(|e| format!("Failed to run git diff: {}", e))?
        } else {
            // Initial commit - show all files
            Command::new("git")
                .args(["diff", "--cached"])
                .current_dir(cwd)
                .output()
                .map_err(|e| format!("Failed to run git diff: {}", e))?
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git diff failed: {}", stderr));
    }

    let diff = String::from_utf8_lossy(&output.stdout).to_string();

    // Count files changed by looking at diff headers
    let files_changed = diff.lines()
        .filter(|line| line.starts_with("diff --git"))
        .count();

    Ok(GitDiffResult {
        diff,
        files_changed,
    })
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    fn init_git_repo(path: &Path) -> Result<(), String> {
        Command::new("git")
            .args(["init"])
            .current_dir(path)
            .output()
            .map_err(|e| format!("Failed to init git: {}", e))?;

        // Configure git for testing
        Command::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(path)
            .output()
            .ok();

        Command::new("git")
            .args(["config", "user.name", "Test User"])
            .current_dir(path)
            .output()
            .ok();

        Ok(())
    }

    fn create_test_file(dir: &Path, path: &str, content: &str) -> std::io::Result<()> {
        let full_path = dir.join(path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut file = fs::File::create(full_path)?;
        file.write_all(content.as_bytes())?;
        Ok(())
    }

    #[test]
    fn test_git_status_non_git_repo() {
        let temp_dir = TempDir::new().unwrap();
        let dir_path = temp_dir.path().to_string_lossy().to_string();

        let result = git_status(dir_path);

        assert!(result.is_ok());
        let status = result.unwrap();
        assert!(!status.is_git_repo);
        assert!(!status.has_changes);
        assert!(status.changed_files.is_empty());
        assert!(status.untracked_files.is_empty());
    }

    #[test]
    fn test_git_status_clean_repo() {
        let temp_dir = TempDir::new().unwrap();
        let dir_path = temp_dir.path();

        init_git_repo(dir_path).unwrap();

        let result = git_status(dir_path.to_string_lossy().to_string());

        assert!(result.is_ok());
        let status = result.unwrap();
        assert!(status.is_git_repo);
        assert!(!status.has_changes); // Clean repo, no changes
    }

    #[test]
    fn test_git_status_with_untracked_files() {
        let temp_dir = TempDir::new().unwrap();
        let dir_path = temp_dir.path();

        init_git_repo(dir_path).unwrap();
        create_test_file(dir_path, "untracked.txt", "content").unwrap();

        let result = git_status(dir_path.to_string_lossy().to_string());

        assert!(result.is_ok());
        let status = result.unwrap();
        assert!(status.is_git_repo);
        assert!(status.has_changes);
        assert_eq!(status.untracked_files.len(), 1);
        assert!(status.untracked_files[0].contains("untracked.txt"));
    }

    #[test]
    fn test_git_status_with_modified_files() {
        let temp_dir = TempDir::new().unwrap();
        let dir_path = temp_dir.path();

        init_git_repo(dir_path).unwrap();

        // Create and commit a file
        create_test_file(dir_path, "tracked.txt", "original").unwrap();
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir_path)
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "initial"])
            .current_dir(dir_path)
            .output()
            .unwrap();

        // Modify the file
        create_test_file(dir_path, "tracked.txt", "modified").unwrap();

        let result = git_status(dir_path.to_string_lossy().to_string());

        assert!(result.is_ok());
        let status = result.unwrap();
        assert!(status.is_git_repo);
        assert!(status.has_changes);
        assert_eq!(status.changed_files.len(), 1);
        assert!(status.changed_files[0].contains("tracked.txt"));
    }

    #[test]
    fn test_git_status_nonexistent_directory() {
        let result = git_status("/nonexistent/path".to_string());

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Working directory does not exist");
    }

    #[test]
    fn test_read_file_existing() {
        let temp_dir = TempDir::new().unwrap();
        let dir_path = temp_dir.path();

        let content = "test file content";
        create_test_file(dir_path, "test.txt", content).unwrap();

        let result = read_file(
            dir_path.to_string_lossy().to_string(),
            "test.txt".to_string(),
        );

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), content);
    }

    #[test]
    fn test_read_file_nonexistent() {
        let temp_dir = TempDir::new().unwrap();
        let dir_path = temp_dir.path();

        let result = read_file(
            dir_path.to_string_lossy().to_string(),
            "nonexistent.txt".to_string(),
        );

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ""); // Returns empty string for missing files
    }

    #[test]
    fn test_get_staged_diff_not_git_repo() {
        let temp_dir = TempDir::new().unwrap();
        let dir_path = temp_dir.path().to_string_lossy().to_string();

        let result = get_staged_diff(dir_path, None);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Not a git repository");
    }

    #[test]
    fn test_git_diff_result_counts_files() {
        // Create a sample diff output
        let diff = "diff --git a/file1.txt b/file1.txt\n\
                    index 1234567..abcdefg 100644\n\
                    --- a/file1.txt\n\
                    +++ b/file1.txt\n\
                    @@ -1,1 +1,1 @@\n\
                    -old content\n\
                    +new content\n\
                    diff --git a/file2.txt b/file2.txt\n\
                    index 1234567..abcdefg 100644\n\
                    --- a/file2.txt\n\
                    +++ b/file2.txt\n\
                    @@ -1,1 +1,1 @@\n\
                    -old\n\
                    +new\n";

        let files_changed = diff.lines()
            .filter(|line| line.starts_with("diff --git"))
            .count();

        assert_eq!(files_changed, 2);
    }

    #[test]
    fn test_git_revert_non_git_repo() {
        let temp_dir = TempDir::new().unwrap();
        let dir_path = temp_dir.path().to_string_lossy().to_string();

        let result = git_revert_all(dir_path);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Not a git repository");
    }
}
