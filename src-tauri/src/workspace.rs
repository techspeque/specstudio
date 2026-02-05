// ============================================================================
// Workspace Commands
// Handles file I/O for specs and workspace context
// ============================================================================

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

// ============================================================================
// Constants
// ============================================================================

const SPECS_DIR: &str = ".specstudio/specs";

// Directories/files to exclude when reading workspace for AI context
const EXCLUDED_DIRS: &[&str] = &[
    ".specstudio", // CRITICAL: Prevents AI from reading its own plan JSONs
    "node_modules",
    ".git",
    ".next",
    ".nuxt",
    "dist",
    "build",
    "target",
    ".turbo",
    ".cache",
    ".parcel-cache",
    "coverage",
    ".nyc_output",
    "__pycache__",
    ".pytest_cache",
    "venv",
    ".venv",
    "env",
    ".env",
    ".tox",
    "vendor",
    "Pods",
    ".gradle",
    ".idea",
    ".vscode",
    ".DS_Store",
    "out",
];

const EXCLUDED_EXTENSIONS: &[&str] = &[
    "lock",
    "log",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "svg",
    "ico",
    "woff",
    "woff2",
    "ttf",
    "eot",
    "mp3",
    "mp4",
    "wav",
    "avi",
    "mov",
    "pdf",
    "zip",
    "tar",
    "gz",
    "rar",
    "7z",
    "exe",
    "dll",
    "so",
    "dylib",
    "bin",
    "dat",
    "db",
    "sqlite",
    "sqlite3",
];

// Max file size to include (1MB)
const MAX_FILE_SIZE: u64 = 1024 * 1024;
// Max total context size (5MB)
const MAX_TOTAL_SIZE: usize = 5 * 1024 * 1024;

const FORBIDDEN_PATHS: &[&str] = &[
    "/etc", "/usr", "/bin", "/sbin", "/lib", "/lib64",
    "/boot", "/dev", "/proc", "/sys", "/run", "/var",
    "/root", "/snap",
];

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Spec {
    pub filename: String,
    pub title: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceData {
    pub specs: Vec<Spec>,
    pub working_directory: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateResult {
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveResult {
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecContent {
    pub filename: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceContext {
    pub files: Vec<FileContent>,
    pub total_files: usize,
    pub total_size: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub content: String,
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub fn validate_workspace(input_path: String) -> ValidateResult {
    if input_path.is_empty() {
        return ValidateResult {
            valid: false,
            error: Some("Path is required".to_string()),
            path: None,
            created: None,
        };
    }

    let path = Path::new(&input_path);

    if !path.is_absolute() {
        return ValidateResult {
            valid: false,
            error: Some("Path must be absolute (e.g., /home/user/projects/my-app)".to_string()),
            path: None,
            created: None,
        };
    }

    let resolved_path = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => PathBuf::from(&input_path),
    };

    let resolved_str = resolved_path.to_string_lossy().to_string();

    for forbidden in FORBIDDEN_PATHS {
        if resolved_str == *forbidden || resolved_str.starts_with(&format!("{}/", forbidden)) {
            return ValidateResult {
                valid: false,
                error: Some("Cannot use system directories as workspace".to_string()),
                path: None,
                created: None,
            };
        }
    }

    if resolved_path.exists() {
        if resolved_path.is_dir() {
            return ValidateResult {
                valid: true,
                error: None,
                path: Some(resolved_str),
                created: Some(false),
            };
        } else {
            return ValidateResult {
                valid: false,
                error: Some("Path exists but is not a directory".to_string()),
                path: None,
                created: None,
            };
        }
    }

    match fs::create_dir_all(&resolved_path) {
        Ok(_) => ValidateResult {
            valid: true,
            error: None,
            path: Some(resolved_str),
            created: Some(true),
        },
        Err(e) => ValidateResult {
            valid: false,
            error: Some(format!("Failed to create directory: {}", e)),
            path: None,
            created: None,
        },
    }
}

/// Read workspace data (list of specs)
#[tauri::command]
pub fn read_workspace(working_directory: Option<String>) -> Result<WorkspaceData, String> {
    let cwd = working_directory
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let specs = list_specs_internal(&cwd)?;

    Ok(WorkspaceData {
        specs,
        working_directory: cwd.to_string_lossy().to_string(),
    })
}

/// List all specs in .specstudio/specs/
#[tauri::command]
pub fn list_specs(working_directory: Option<String>) -> Result<Vec<Spec>, String> {
    let cwd = working_directory
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    list_specs_internal(&cwd)
}

/// Read a specific spec file
#[tauri::command]
pub fn read_spec(filename: String, working_directory: Option<String>) -> Result<SpecContent, String> {
    let cwd = working_directory
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let specs_dir = cwd.join(SPECS_DIR);
    let spec_path = specs_dir.join(&filename);

    if !spec_path.exists() {
        return Err(format!("Spec file not found: {}", filename));
    }

    let content = fs::read_to_string(&spec_path)
        .map_err(|e| format!("Failed to read spec file: {}", e))?;

    Ok(SpecContent { filename, content })
}

/// Save a spec file to .specstudio/specs/
#[tauri::command]
pub fn save_spec(filename: String, content: String, working_directory: Option<String>) -> Result<SaveResult, String> {
    let cwd = working_directory
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let specs_dir = cwd.join(SPECS_DIR);

    // Ensure the .specstudio/specs directory exists
    if !specs_dir.exists() {
        fs::create_dir_all(&specs_dir)
            .map_err(|e| format!("Failed to create specs directory: {}", e))?;
    }

    let spec_path = specs_dir.join(&filename);

    fs::write(&spec_path, &content)
        .map_err(|e| format!("Failed to save spec file: {}", e))?;

    Ok(SaveResult { success: true })
}

/// Delete a spec file
#[tauri::command]
pub fn delete_spec(filename: String, working_directory: Option<String>) -> Result<SaveResult, String> {
    let cwd = working_directory
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let specs_dir = cwd.join(SPECS_DIR);
    let spec_path = specs_dir.join(&filename);

    if !spec_path.exists() {
        return Err(format!("Spec file not found: {}", filename));
    }

    fs::remove_file(&spec_path)
        .map_err(|e| format!("Failed to delete spec file: {}", e))?;

    // Also delete companion plan file if it exists (prevent orphaned plans)
    let plan_filename = filename.replace(".md", ".plan.json");
    let plan_path = specs_dir.join(&plan_filename);
    if plan_path.exists() {
        let _ = fs::remove_file(&plan_path); // Ignore errors if plan doesn't exist
        println!("[delete_spec] Cleaned up companion plan file: {}", plan_filename);
    }

    Ok(SaveResult { success: true })
}

/// Factory reset - clear all stores and return success
/// Frontend should clear localStorage and relaunch the app
#[tauri::command]
pub fn factory_reset(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    println!("[factory_reset] Starting factory reset...");

    // Clear settings.json store - ignore errors if store doesn't exist
    println!("[factory_reset] Attempting to clear settings store...");
    match app.store("settings.json") {
        Ok(settings_store) => {
            println!("[factory_reset] Settings store opened, clearing...");
            settings_store.clear();
            if let Err(e) = settings_store.save() {
                eprintln!("[factory_reset] Warning: Failed to save settings store: {}", e);
                // Continue anyway - we're resetting
            } else {
                println!("[factory_reset] Settings store cleared successfully");
            }
        }
        Err(e) => {
            eprintln!("[factory_reset] Note: Could not open settings store (may not exist): {}", e);
            // Continue - store might not exist yet
        }
    }

    // Clear auth.json store - ignore errors if store doesn't exist
    println!("[factory_reset] Attempting to clear auth store...");
    match app.store("auth.json") {
        Ok(auth_store) => {
            println!("[factory_reset] Auth store opened, clearing...");
            auth_store.clear();
            if let Err(e) = auth_store.save() {
                eprintln!("[factory_reset] Warning: Failed to save auth store: {}", e);
                // Continue anyway - we're resetting
            } else {
                println!("[factory_reset] Auth store cleared successfully");
            }
        }
        Err(e) => {
            eprintln!("[factory_reset] Note: Could not open auth store (may not exist): {}", e);
            // Continue - store might not exist yet
        }
    }

    println!("[factory_reset] Factory reset completed");
    Ok(())
}

/// Read workspace files for AI context (with exclusions)
#[tauri::command]
pub fn read_workspace_context(working_directory: String) -> Result<WorkspaceContext, String> {
    let cwd = PathBuf::from(&working_directory);

    if !cwd.exists() || !cwd.is_dir() {
        return Err("Working directory does not exist".to_string());
    }

    let mut files: Vec<FileContent> = Vec::new();
    let mut total_size: usize = 0;
    let mut truncated = false;

    collect_files(&cwd, &cwd, &mut files, &mut total_size, &mut truncated)?;

    let total_files = files.len();

    Ok(WorkspaceContext {
        files,
        total_files,
        total_size,
        truncated,
    })
}

fn collect_files(
    base: &Path,
    dir: &Path,
    files: &mut Vec<FileContent>,
    total_size: &mut usize,
    truncated: &mut bool,
) -> Result<(), String> {
    if *total_size >= MAX_TOTAL_SIZE {
        *truncated = true;
        return Ok(());
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        // Skip excluded directories
        if path.is_dir() {
            if EXCLUDED_DIRS.contains(&file_name) {
                continue;
            }
            // Recurse into subdirectory
            collect_files(base, &path, files, total_size, truncated)?;
            continue;
        }

        // Skip non-files
        if !path.is_file() {
            continue;
        }

        // Skip by extension
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if EXCLUDED_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                continue;
            }
        }

        // Skip files that are too large
        let metadata = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        if metadata.len() > MAX_FILE_SIZE {
            continue;
        }

        // Check if adding this file would exceed total limit
        if *total_size + metadata.len() as usize > MAX_TOTAL_SIZE {
            *truncated = true;
            continue;
        }

        // Read file content
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue, // Skip binary files that can't be read as UTF-8
        };

        // Get relative path
        let relative_path = path.strip_prefix(base)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        *total_size += content.len();
        files.push(FileContent {
            path: relative_path,
            content,
        });
    }

    Ok(())
}

// ============================================================================
// Helper Functions
// ============================================================================

fn list_specs_internal(cwd: &Path) -> Result<Vec<Spec>, String> {
    let specs_dir = cwd.join(SPECS_DIR);

    if !specs_dir.exists() {
        fs::create_dir_all(&specs_dir)
            .map_err(|e| format!("Failed to create specs directory: {}", e))?;
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&specs_dir)
        .map_err(|e| format!("Failed to read specs directory: {}", e))?;

    let mut specs: Vec<Spec> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();

        if path.extension().map_or(false, |ext| ext == "md") {
            let filename = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            if let Ok(content) = fs::read_to_string(&path) {
                let title = extract_first_heading(&content)
                    .unwrap_or_else(|| filename.trim_end_matches(".md").to_string());

                // Extract date from filename if present (YYYYMMDD-name.md format)
                let created_at = extract_date_from_filename(&filename)
                    .unwrap_or_else(|| {
                        // Fallback to file modification time
                        path.metadata()
                            .and_then(|m| m.modified())
                            .ok()
                            .map(|t| {
                                let datetime: chrono::DateTime<chrono::Utc> = t.into();
                                datetime.format("%Y-%m-%d").to_string()
                            })
                            .unwrap_or_else(|| "Unknown".to_string())
                    });

                specs.push(Spec {
                    filename,
                    title,
                    created_at,
                });
            }
        }
    }

    // Sort by filename (which includes date prefix) descending
    specs.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(specs)
}

fn extract_first_heading(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            return Some(trimmed[2..].trim().to_string());
        }
    }
    None
}

fn extract_date_from_filename(filename: &str) -> Option<String> {
    // Expected format: YYYYMMDD-feature-name.md
    if filename.len() >= 8 {
        let date_part = &filename[..8];
        if date_part.chars().all(|c| c.is_ascii_digit()) {
            // Format as YYYY-MM-DD
            return Some(format!(
                "{}-{}-{}",
                &date_part[..4],
                &date_part[4..6],
                &date_part[6..8]
            ));
        }
    }
    None
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_first_heading() {
        let content = "# My Title\n\nSome content";
        assert_eq!(extract_first_heading(content), Some("My Title".to_string()));

        let content_no_heading = "Just some text\nNo heading here";
        assert_eq!(extract_first_heading(content_no_heading), None);

        let content_with_spaces = "#    Spaced Title   \n";
        assert_eq!(extract_first_heading(content_with_spaces), Some("Spaced Title".to_string()));

        let content_h2 = "## Second Level\n";
        assert_eq!(extract_first_heading(content_h2), None);
    }

    #[test]
    fn test_extract_date_from_filename() {
        assert_eq!(
            extract_date_from_filename("20260131-feature.md"),
            Some("2026-01-31".to_string())
        );

        assert_eq!(
            extract_date_from_filename("20251225-christmas.md"),
            Some("2025-12-25".to_string())
        );

        assert_eq!(extract_date_from_filename("feature.md"), None);

        assert_eq!(extract_date_from_filename("202601-incomplete.md"), None);

        assert_eq!(extract_date_from_filename("notadate-file.md"), None);
    }

    #[test]
    fn test_validate_workspace() {
        // Test empty path
        let result = validate_workspace("".to_string());
        assert!(!result.valid);
        assert_eq!(result.error, Some("Path is required".to_string()));

        // Test relative path (not allowed)
        let result = validate_workspace("./relative/path".to_string());
        assert!(!result.valid);
        assert!(result.error.as_ref().unwrap().contains("must be absolute"));

        // Test that FORBIDDEN_PATHS list is not empty and contains expected paths
        assert!(FORBIDDEN_PATHS.contains(&"/etc"));
        assert!(FORBIDDEN_PATHS.contains(&"/usr"));
    }

    #[test]
    fn test_excluded_dirs_contains_specstudio() {
        // CRITICAL: Ensure .specstudio is excluded to prevent AI from reading its own plans
        assert!(EXCLUDED_DIRS.contains(&".specstudio"));
    }

    #[test]
    fn test_max_limits() {
        // Ensure reasonable limits are set
        assert_eq!(MAX_FILE_SIZE, 1024 * 1024); // 1MB
        assert_eq!(MAX_TOTAL_SIZE, 5 * 1024 * 1024); // 5MB
    }

    #[test]
    fn test_specs_dir_constant() {
        assert_eq!(SPECS_DIR, ".specstudio/specs");
    }
}
