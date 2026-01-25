// ============================================================================
// SpecStudio Tauri Backend
// Handles workspace I/O, shell spawning, and native integrations
// ============================================================================

mod auth;
mod gemini;
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
            // Workspace commands
            workspace::validate_workspace,
            workspace::read_workspace,
            workspace::save_workspace,
            // Shell commands
            shell::spawn_streaming_process,
            shell::cancel_streaming_processes,
            // Auth commands
            auth::start_google_oauth,
            auth::check_google_auth,
            auth::get_google_access_token,
            auth::logout_google,
            auth::start_anthropic_oauth,
            auth::check_anthropic_auth,
            auth::get_anthropic_access_token,
            auth::logout_anthropic,
            auth::check_all_auth,
            // Gemini chat commands
            gemini::chat_with_gemini,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
