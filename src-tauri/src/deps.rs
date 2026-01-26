// ============================================================================
// Dependency Checker
// Verifies required CLI tools are installed (gcloud, claude)
// ============================================================================

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
    pub name: String,
    pub installed: bool,
    pub version: Option<String>,
    pub install_url: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyCheckResult {
    pub all_installed: bool,
    pub dependencies: Vec<DependencyStatus>,
}

/// Check if a command exists and get its version
fn check_command(cmd: &str, version_args: &[&str]) -> (bool, Option<String>) {
    match Command::new(cmd).args(version_args).output() {
        Ok(output) if output.status.success() => {
            let version_output = String::from_utf8_lossy(&output.stdout);
            // Extract first line as version info
            let version = version_output
                .lines()
                .next()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            (true, version)
        }
        _ => (false, None),
    }
}

/// Check all required dependencies
#[tauri::command]
pub fn check_dependencies() -> DependencyCheckResult {
    let mut dependencies = Vec::new();

    // Check claude CLI
    let (claude_installed, claude_version) = check_command("claude", &["--version"]);
    dependencies.push(DependencyStatus {
        name: "Claude Code CLI".to_string(),
        installed: claude_installed,
        version: claude_version,
        install_url: "https://docs.anthropic.com/en/docs/claude-code".to_string(),
        description: "Required for AI code generation and tests".to_string(),
    });

    let all_installed = dependencies.iter().all(|d| d.installed);

    DependencyCheckResult {
        all_installed,
        dependencies,
    }
}
