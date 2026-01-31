// ============================================================================
// File Tree Commands
// Provides file system tree listing with filtering
// Uses the 'ignore' crate to automatically respect .gitignore rules
// ============================================================================

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

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
/// Uses the 'ignore' crate to automatically respect .gitignore rules
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

    let children = build_tree_with_ignore(
        cwd,
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

/// Build file tree using the 'ignore' crate which respects .gitignore
fn build_tree_with_ignore(
    base: &Path,
    max_depth: usize,
    changed_files: &std::collections::HashSet<String>,
    total_files: &mut usize,
    total_dirs: &mut usize,
) -> Result<Vec<FileNode>, String> {
    // Build the walker with gitignore support
    let walker = WalkBuilder::new(base)
        .max_depth(Some(max_depth))
        .hidden(true) // Respect hidden file rules
        .git_ignore(true) // Respect .gitignore
        .git_global(true) // Respect global gitignore
        .git_exclude(true) // Respect .git/info/exclude
        .standard_filters(true) // Apply standard ignore filters
        .build();

    // Collect all entries into a map organized by parent directory
    let mut entries_by_parent: HashMap<PathBuf, Vec<FileNode>> = HashMap::new();

    for result in walker {
        let entry = match result {
            Ok(entry) => entry,
            Err(_) => continue, // Skip errors
        };

        let path = entry.path();

        // Skip the root directory itself
        if path == base {
            continue;
        }

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // Get relative path
        let relative_path = path
            .strip_prefix(base)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        let is_dir = path.is_dir();

        if is_dir {
            *total_dirs += 1;
        } else {
            *total_files += 1;
        }

        let is_modified = changed_files.contains(&relative_path);

        let node = FileNode {
            name: file_name,
            path: relative_path,
            is_dir,
            children: if is_dir { Some(Vec::new()) } else { None },
            modified: if is_modified { Some(true) } else { None },
        };

        // Get parent directory
        let parent = path.parent().unwrap_or(base);
        entries_by_parent
            .entry(parent.to_path_buf())
            .or_insert_with(Vec::new)
            .push(node);
    }

    // Build the tree structure starting from the root
    let mut root_children = build_tree_recursive(base, &entries_by_parent);

    // Sort: directories first, then alphabetically
    sort_nodes(&mut root_children);

    Ok(root_children)
}

/// Recursively build the tree structure from the flat map
fn build_tree_recursive(
    dir: &Path,
    entries_by_parent: &HashMap<PathBuf, Vec<FileNode>>,
) -> Vec<FileNode> {
    let mut nodes = entries_by_parent
        .get(dir)
        .cloned()
        .unwrap_or_default();

    // For each directory node, recursively build its children
    for node in &mut nodes {
        if node.is_dir {
            let child_path = dir.join(&node.name);
            let children = build_tree_recursive(&child_path, entries_by_parent);
            node.children = Some(children);
        }
    }

    // Filter out empty directories
    nodes.retain(|node| {
        !node.is_dir || node.children.as_ref().map_or(false, |c| !c.is_empty())
    });

    nodes
}

/// Sort nodes: directories first, then alphabetically
fn sort_nodes(nodes: &mut [FileNode]) {
    nodes.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    // Recursively sort children
    for node in nodes {
        if let Some(ref mut children) = node.children {
            sort_nodes(children);
        }
    }
}
