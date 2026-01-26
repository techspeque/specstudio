// ============================================================================
// File Tree Commands
// Provides file system tree listing with filtering
// ============================================================================

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

// ============================================================================
// Constants
// ============================================================================

// Directories to exclude from the file tree
const EXCLUDED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
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
    ".tox",
    "vendor",
    "Pods",
    ".gradle",
    ".idea",
    ".vscode",
];

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeResult {
    pub root: FileNode,
    pub total_files: usize,
    pub total_dirs: usize,
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Get file tree for a working directory
#[tauri::command]
pub fn get_file_tree(
    working_directory: String,
    max_depth: Option<usize>,
    changed_files: Option<Vec<String>>,
) -> Result<FileTreeResult, String> {
    let cwd = Path::new(&working_directory);

    if !cwd.exists() || !cwd.is_dir() {
        return Err("Working directory does not exist".to_string());
    }

    let max_depth = max_depth.unwrap_or(10);
    let changed_set: std::collections::HashSet<String> = changed_files
        .unwrap_or_default()
        .into_iter()
        .collect();

    let mut total_files: usize = 0;
    let mut total_dirs: usize = 0;

    let root_name = cwd
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(".")
        .to_string();

    let children = build_tree(
        cwd,
        cwd,
        0,
        max_depth,
        &changed_set,
        &mut total_files,
        &mut total_dirs,
    )?;

    let root = FileNode {
        name: root_name,
        path: String::new(),
        is_dir: true,
        children: Some(children),
        modified: None,
    };

    Ok(FileTreeResult {
        root,
        total_files,
        total_dirs,
    })
}

fn build_tree(
    base: &Path,
    dir: &Path,
    depth: usize,
    max_depth: usize,
    changed_files: &std::collections::HashSet<String>,
    total_files: &mut usize,
    total_dirs: &mut usize,
) -> Result<Vec<FileNode>, String> {
    if depth >= max_depth {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut nodes: Vec<FileNode> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // Skip hidden files (except for specific dotfiles we might want)
        if file_name.starts_with('.') && !matches!(file_name.as_str(), ".env.example" | ".gitignore") {
            continue;
        }

        // Get relative path
        let relative_path = path
            .strip_prefix(base)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        if path.is_dir() {
            // Skip excluded directories
            if EXCLUDED_DIRS.contains(&file_name.as_str()) {
                continue;
            }

            *total_dirs += 1;

            let children = build_tree(
                base,
                &path,
                depth + 1,
                max_depth,
                changed_files,
                total_files,
                total_dirs,
            )?;

            // Only include directories that have children
            if !children.is_empty() {
                nodes.push(FileNode {
                    name: file_name,
                    path: relative_path,
                    is_dir: true,
                    children: Some(children),
                    modified: None,
                });
            }
        } else if path.is_file() {
            *total_files += 1;

            let is_modified = changed_files.contains(&relative_path);

            nodes.push(FileNode {
                name: file_name,
                path: relative_path,
                is_dir: false,
                children: None,
                modified: if is_modified { Some(true) } else { None },
            });
        }
    }

    // Sort: directories first, then alphabetically
    nodes.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(nodes)
}
