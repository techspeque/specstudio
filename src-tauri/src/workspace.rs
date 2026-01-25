// ============================================================================
// Workspace Commands
// Handles file I/O for spec.md and ADR files
// ============================================================================

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

// ============================================================================
// Constants
// ============================================================================

const SPEC_FILE: &str = "spec.md";
const ADR_DIR: &str = "docs/adr";

const DEFAULT_SPEC_CONTENT: &str = r#"# Feature Specification

## Overview
Describe the feature or component you want to build.

## Requirements
- Requirement 1
- Requirement 2
- Requirement 3

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Technical Notes
Add any implementation details or constraints here.
"#;

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
pub struct Adr {
    pub id: String,
    pub title: String,
    pub status: String,
    pub context: String,
    pub decision: String,
    pub consequences: String,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceData {
    pub spec_content: String,
    pub adrs: Vec<Adr>,
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

#[tauri::command]
pub fn read_workspace(working_directory: Option<String>) -> Result<WorkspaceData, String> {
    let cwd = working_directory
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let spec_content = read_spec(&cwd)?;
    let adrs = read_adrs(&cwd)?;

    Ok(WorkspaceData {
        spec_content,
        adrs,
        working_directory: cwd.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn save_workspace(spec_content: String, working_directory: Option<String>) -> Result<SaveResult, String> {
    let cwd = working_directory
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let spec_path = cwd.join(SPEC_FILE);

    fs::write(&spec_path, &spec_content)
        .map_err(|e| format!("Failed to save spec.md: {}", e))?;

    Ok(SaveResult { success: true })
}

// ============================================================================
// Helper Functions
// ============================================================================

fn read_spec(cwd: &Path) -> Result<String, String> {
    let spec_path = cwd.join(SPEC_FILE);

    if !spec_path.exists() {
        fs::write(&spec_path, DEFAULT_SPEC_CONTENT)
            .map_err(|e| format!("Failed to create spec.md: {}", e))?;
        return Ok(DEFAULT_SPEC_CONTENT.to_string());
    }

    fs::read_to_string(&spec_path)
        .map_err(|e| format!("Failed to read spec.md: {}", e))
}

fn read_adrs(cwd: &Path) -> Result<Vec<Adr>, String> {
    let adr_path = cwd.join(ADR_DIR);

    if !adr_path.exists() {
        fs::create_dir_all(&adr_path)
            .map_err(|e| format!("Failed to create ADR directory: {}", e))?;
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&adr_path)
        .map_err(|e| format!("Failed to read ADR directory: {}", e))?;

    let mut adrs: Vec<Adr> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();

        if path.extension().map_or(false, |ext| ext == "md") {
            let filename = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            if let Ok(content) = fs::read_to_string(&path) {
                if let Some(adr) = parse_adr(&content, &filename) {
                    adrs.push(adr);
                }
            }
        }
    }

    adrs.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(adrs)
}

fn parse_adr(content: &str, filename: &str) -> Option<Adr> {
    let id = extract_adr_id(filename);

    if content.starts_with("---\n") {
        if let Some(end_idx) = content[4..].find("\n---") {
            let frontmatter = &content[4..4 + end_idx];
            let body = content[4 + end_idx + 4..].trim();

            let title = extract_frontmatter_field(frontmatter, "title")
                .or_else(|| extract_first_heading(content))
                .unwrap_or_else(|| filename.to_string());

            let status = extract_frontmatter_field(frontmatter, "status")
                .map(|s| validate_status(&s))
                .unwrap_or_else(|| "proposed".to_string());

            return Some(Adr {
                id,
                title,
                status,
                context: extract_section(body, "Context").unwrap_or_default(),
                decision: extract_section(body, "Decision").unwrap_or_default(),
                consequences: extract_section(body, "Consequences").unwrap_or_default(),
                filename: filename.to_string(),
            });
        }
    }

    let title = extract_first_heading(content)
        .unwrap_or_else(|| filename.to_string());

    let status = extract_status_from_content(content);

    Some(Adr {
        id,
        title,
        status,
        context: extract_section(content, "Context").unwrap_or_default(),
        decision: extract_section(content, "Decision").unwrap_or_default(),
        consequences: extract_section(content, "Consequences").unwrap_or_default(),
        filename: filename.to_string(),
    })
}

fn extract_adr_id(filename: &str) -> String {
    let lowercase = filename.to_lowercase();
    if let Some(start) = lowercase.find("adr-") {
        let rest = &lowercase[start..];
        let mut end = 4;
        for c in rest[4..].chars() {
            if c.is_ascii_digit() {
                end += 1;
            } else {
                break;
            }
        }
        return rest[..end].to_string();
    }
    filename.strip_suffix(".md").unwrap_or(filename).to_string()
}

fn extract_frontmatter_field(frontmatter: &str, field: &str) -> Option<String> {
    for line in frontmatter.lines() {
        let trimmed = line.trim();
        if trimmed.to_lowercase().starts_with(&format!("{}:", field.to_lowercase())) {
            let value = trimmed[field.len() + 1..].trim();
            let unquoted = value.trim_matches('"').trim_matches('\'');
            if !unquoted.is_empty() {
                return Some(unquoted.to_string());
            }
        }
    }
    None
}

fn extract_first_heading(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            return Some(trimmed[2..].trim().to_string());
        }
        if trimmed.starts_with("## ") {
            return Some(trimmed[3..].trim().to_string());
        }
    }
    None
}

fn extract_section(content: &str, section_name: &str) -> Option<String> {
    let section_lower = section_name.to_lowercase();
    let lines: Vec<&str> = content.lines().collect();

    let mut in_section = false;
    let mut section_content = Vec::new();

    for line in lines {
        let trimmed = line.trim();

        if trimmed.starts_with("## ") || trimmed.starts_with("### ") {
            let header_text = trimmed.trim_start_matches('#').trim().to_lowercase();

            if header_text.starts_with(&section_lower) {
                in_section = true;
                continue;
            } else if in_section {
                break;
            }
        } else if in_section {
            section_content.push(line);
        }
    }

    if section_content.is_empty() {
        None
    } else {
        Some(section_content.join("\n").trim().to_string())
    }
}

fn extract_status_from_content(content: &str) -> String {
    let content_lower = content.to_lowercase();

    if let Some(idx) = content_lower.find("status:") {
        let rest = &content_lower[idx + 7..];
        let status_word: String = rest
            .trim()
            .chars()
            .take_while(|c| c.is_alphabetic())
            .collect();

        if !status_word.is_empty() {
            return validate_status(&status_word);
        }
    }

    if let Some(status_section) = extract_section(content, "Status") {
        let status = status_section.to_lowercase();
        let first_word: String = status
            .trim()
            .chars()
            .take_while(|c| c.is_alphabetic())
            .collect();

        if !first_word.is_empty() {
            return validate_status(&first_word);
        }
    }

    "proposed".to_string()
}

fn validate_status(status: &str) -> String {
    let normalized = status.to_lowercase();
    match normalized.trim() {
        "proposed" | "accepted" | "deprecated" | "superseded" => normalized.trim().to_string(),
        _ => "proposed".to_string(),
    }
}
