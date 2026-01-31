// ============================================================================
// SpecStudio Tauri Backend
// Handles workspace I/O, shell spawning, and native integrations
// ============================================================================

mod auth;
mod deps;
mod filetree;
mod gemini;
mod git;
mod search;
mod shell;
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(shell::ProcessRegistry::new())
        .invoke_handler(tauri::generate_handler![
            // Dependency check commands
            deps::check_dependencies,
            // Workspace commands
            workspace::validate_workspace,
            workspace::read_workspace,
            workspace::list_specs,
            workspace::read_spec,
            workspace::save_spec,
            workspace::delete_spec,
            workspace::read_workspace_context,
            // Shell commands
            shell::spawn_streaming_process,
            shell::send_process_input,
            shell::cancel_streaming_processes,
            // Auth commands
            auth::check_google_oauth_configured,
            auth::start_google_oauth,
            auth::check_google_auth,
            auth::get_google_access_token,
            auth::logout_google,
            auth::check_anthropic_auth,
            auth::start_anthropic_oauth,
            auth::logout_anthropic,
            auth::check_all_auth,
            // Gemini chat commands
            gemini::chat_with_gemini,
            gemini::validate_gemini_api_key,
            // Git commands
            git::git_status,
            git::git_revert_all,
            git::git_show_file,
            git::read_file,
            git::get_staged_diff,
            // File tree commands
            filetree::get_file_tree,
            // Search commands
            search::search_files,
            search::search_file_names,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
