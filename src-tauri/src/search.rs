// ============================================================================
// File Search Commands
// Provides content search with .gitignore support
// Uses the 'ignore' crate to automatically respect .gitignore rules
// ============================================================================

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub path: String,
    pub line_number: usize,
    pub line_content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub total_matches: usize,
    pub files_searched: usize,
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Search for files containing the query string
/// Respects .gitignore and other ignore rules
#[tauri::command]
pub fn search_files(
    query: String,
    path: String,
    max_results: Option<usize>,
) -> Result<SearchResponse, String> {
    let search_path = Path::new(&path);

    if !search_path.exists() {
        return Err("Search path does not exist".to_string());
    }

    let max_results = max_results.unwrap_or(1000);
    let query_lower = query.to_lowercase();

    // Build the walker with gitignore support
    let walker = WalkBuilder::new(search_path)
        .hidden(true) // Respect hidden file rules
        .git_ignore(true) // Respect .gitignore
        .git_global(true) // Respect global gitignore
        .git_exclude(true) // Respect .git/info/exclude
        .standard_filters(true) // Apply standard ignore filters
        .build();

    let mut results = Vec::new();
    let mut files_searched = 0;

    for result in walker {
        let entry = match result {
            Ok(entry) => entry,
            Err(_) => continue, // Skip errors
        };

        let entry_path = entry.path();

        // Only search files (not directories)
        if !entry_path.is_file() {
            continue;
        }

        files_searched += 1;

        // Get relative path for display
        let relative_path = entry_path
            .strip_prefix(search_path)
            .unwrap_or(entry_path)
            .to_string_lossy()
            .to_string();

        // Read file content
        let content = match fs::read_to_string(entry_path) {
            Ok(content) => content,
            Err(_) => continue, // Skip binary files or unreadable files
        };

        // Search for query in each line
        for (line_number, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&query_lower) {
                results.push(SearchResult {
                    path: relative_path.clone(),
                    line_number: line_number + 1, // 1-indexed
                    line_content: line.to_string(),
                });

                // Stop if we've reached max results
                if results.len() >= max_results {
                    break;
                }
            }
        }

        // Stop searching files if we've reached max results
        if results.len() >= max_results {
            break;
        }
    }

    let total_matches = results.len();

    Ok(SearchResponse {
        results,
        total_matches,
        files_searched,
    })
}

/// Get list of file paths matching a query (filename search)
/// Returns just the file paths, not content matches
#[tauri::command]
pub fn search_file_names(
    query: String,
    path: String,
    max_results: Option<usize>,
) -> Result<Vec<String>, String> {
    let search_path = Path::new(&path);

    if !search_path.exists() {
        return Err("Search path does not exist".to_string());
    }

    let max_results = max_results.unwrap_or(100);
    let query_lower = query.to_lowercase();

    // Build the walker with gitignore support
    let walker = WalkBuilder::new(search_path)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .standard_filters(true)
        .build();

    let mut results = Vec::new();

    for result in walker {
        let entry = match result {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let entry_path = entry.path();

        // Only search files (not directories)
        if !entry_path.is_file() {
            continue;
        }

        // Get filename
        let file_name = entry_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        // Check if filename matches query
        if file_name.to_lowercase().contains(&query_lower) {
            let relative_path = entry_path
                .strip_prefix(search_path)
                .unwrap_or(entry_path)
                .to_string_lossy()
                .to_string();

            results.push(relative_path);

            if results.len() >= max_results {
                break;
            }
        }
    }

    Ok(results)
}
