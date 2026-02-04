// ============================================================================
// OAuth Authentication Module
// Handles Google OAuth for API access
// Uses local HTTP server for OAuth callback
// Credentials are stored in user settings (configured during first launch)
// ============================================================================

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use crate::shell::{get_robust_path_env, resolve_binary_path};

const OAUTH_CALLBACK_PORT: u16 = 23847;

// Google OAuth
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES: &str = "https://www.googleapis.com/auth/cloud-platform";

/// Get Google OAuth credentials from user settings
fn get_google_credentials_from_store(app: &AppHandle) -> Result<(String, String), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to open settings store: {}", e))?;

    let client_id = store
        .get("googleClientId")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .ok_or("Google Client ID not configured. Please complete the setup wizard.")?;

    let client_secret = store
        .get("googleClientSecret")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .ok_or("Google Client Secret not configured. Please complete the setup wizard.")?;

    if client_id.is_empty() || client_secret.is_empty() {
        return Err("Google OAuth credentials not configured. Please complete the setup wizard.".to_string());
    }

    Ok((client_id, client_secret))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthCredentials {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct AuthResult {
    pub success: bool,
    pub provider: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
struct AuthEvent {
    provider: String,
    status: String,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatusResponse {
    pub google: bool,
    pub anthropic: bool,
}

/// Check if Google OAuth credentials are configured in settings
#[tauri::command]
pub fn check_google_oauth_configured(app: AppHandle) -> bool {
    get_google_credentials_from_store(&app).is_ok()
}

// ============================================================================
// Google OAuth
// ============================================================================

#[tauri::command]
pub async fn start_google_oauth(app: AppHandle) -> Result<AuthResult, String> {
    let (client_id, client_secret) = get_google_credentials_from_store(&app)?;

    run_oauth_flow(
        &app,
        "google",
        GOOGLE_AUTH_URL,
        GOOGLE_TOKEN_URL,
        &client_id,
        &client_secret,
        GOOGLE_SCOPES,
    )
    .await
}

#[tauri::command]
pub async fn check_google_auth(app: AppHandle) -> Result<bool, String> {
    check_auth(&app, "google").await
}

#[tauri::command]
pub async fn get_google_access_token(app: AppHandle) -> Result<String, String> {
    get_access_token(&app, "google", GOOGLE_TOKEN_URL).await
}

#[tauri::command]
pub async fn logout_google(app: AppHandle) -> Result<(), String> {
    logout(&app, "google").await
}

// ============================================================================
// Claude Code CLI Authentication
// Uses `claude auth status` and `claude auth login` commands
// ============================================================================

/// Check if Claude Code CLI is authenticated by running `claude auth status`
#[tauri::command]
pub async fn check_anthropic_auth() -> Result<bool, String> {
    use std::process::Command;

    // Resolve absolute path to claude binary (critical for macOS .app bundles)
    let claude_path = resolve_binary_path("claude");
    let robust_path = get_robust_path_env();

    let output = Command::new(&claude_path)
        .args(["auth", "status"])
        .env("PATH", robust_path)
        .output()
        .map_err(|e| format!("Failed to run claude auth status: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}{}", stdout, stderr);

    // Check for authenticated indicators in output
    // Claude CLI outputs "Logged in as..." or similar when authenticated
    let is_authenticated = combined.contains("Logged in")
        || combined.contains("logged in")
        || combined.contains("Authenticated")
        || combined.contains("authenticated")
        || (output.status.success() && !combined.contains("not logged in") && !combined.contains("Not logged in"));

    Ok(is_authenticated)
}

/// Start Claude Code CLI OAuth by running `claude auth login`
/// This opens a browser for the user to authenticate
#[tauri::command]
pub async fn start_anthropic_oauth(app: AppHandle) -> Result<AuthResult, String> {
    use std::process::Command;

    let _ = app.emit(
        "auth:status",
        AuthEvent {
            provider: "anthropic".to_string(),
            status: "pending".to_string(),
            message: "Opening browser for Claude authentication...".to_string(),
        },
    );

    // Resolve absolute path to claude binary (critical for macOS .app bundles)
    let claude_path = resolve_binary_path("claude");
    let robust_path = get_robust_path_env();

    // Run claude auth login - this will open browser and wait for completion
    let output = Command::new(&claude_path)
        .args(["auth", "login"])
        .env("PATH", robust_path)
        .output()
        .map_err(|e| format!("Failed to run claude auth login: {}", e))?;

    if output.status.success() {
        let _ = app.emit(
            "auth:status",
            AuthEvent {
                provider: "anthropic".to_string(),
                status: "authenticated".to_string(),
                message: "Successfully authenticated with Claude".to_string(),
            },
        );

        Ok(AuthResult {
            success: true,
            provider: "anthropic".to_string(),
            message: "Successfully authenticated with Claude Code CLI".to_string(),
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let error_msg = if stderr.is_empty() {
            "Authentication failed or was cancelled".to_string()
        } else {
            stderr.to_string()
        };

        let _ = app.emit(
            "auth:status",
            AuthEvent {
                provider: "anthropic".to_string(),
                status: "error".to_string(),
                message: error_msg.clone(),
            },
        );

        Err(error_msg)
    }
}

/// Logout from Claude Code CLI by running `claude auth logout`
#[tauri::command]
pub async fn logout_anthropic(app: AppHandle) -> Result<(), String> {
    use std::process::Command;

    // Resolve absolute path to claude binary (critical for macOS .app bundles)
    let claude_path = resolve_binary_path("claude");
    let robust_path = get_robust_path_env();

    let output = Command::new(&claude_path)
        .args(["auth", "logout"])
        .env("PATH", robust_path)
        .output()
        .map_err(|e| format!("Failed to run claude auth logout: {}", e))?;

    if output.status.success() {
        let _ = app.emit(
            "auth:status",
            AuthEvent {
                provider: "anthropic".to_string(),
                status: "logged_out".to_string(),
                message: "Successfully logged out of Claude".to_string(),
            },
        );
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Logout failed: {}", stderr))
    }
}

// ============================================================================
// Combined Auth Status
// ============================================================================

#[tauri::command]
pub async fn check_all_auth(app: AppHandle) -> Result<AuthStatusResponse, String> {
    let google = check_auth(&app, "google").await.unwrap_or(false);
    let anthropic = check_anthropic_auth().await.unwrap_or(false);

    Ok(AuthStatusResponse { google, anthropic })
}

// ============================================================================
// Shared OAuth Implementation
// ============================================================================

async fn run_oauth_flow(
    app: &AppHandle,
    provider: &str,
    auth_url: &str,
    token_url: &str,
    client_id: &str,
    client_secret: &str,
    scopes: &str,
) -> Result<AuthResult, String> {
    let redirect_uri = format!("http://127.0.0.1:{}", OAUTH_CALLBACK_PORT);

    let full_auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        auth_url,
        urlencoding::encode(client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(scopes)
    );

    let _ = app.emit(
        "auth:status",
        AuthEvent {
            provider: provider.to_string(),
            status: "pending".to_string(),
            message: "Opening browser for authentication...".to_string(),
        },
    );

    let listener = TcpListener::bind(format!("127.0.0.1:{}", OAUTH_CALLBACK_PORT))
        .await
        .map_err(|e| format!("Failed to start OAuth callback server: {}", e))?;

    open::that(&full_auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    let app_handle = app.clone();
    let provider_str = provider.to_string();
    let token_url_str = token_url.to_string();
    let client_id_str = client_id.to_string();
    let client_secret_str = client_secret.to_string();

    let result = tokio::time::timeout(std::time::Duration::from_secs(300), async {
        let (mut socket, _) = listener
            .accept()
            .await
            .map_err(|e| format!("Failed to accept connection: {}", e))?;

        let mut buffer = [0; 4096];
        let n = socket
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Failed to read request: {}", e))?;

        let request = String::from_utf8_lossy(&buffer[..n]);
        let code = extract_code_from_request(&request)?;

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body style=\"font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #18181b; color: #fafafa;\"><div style=\"text-align: center;\"><h1>Authentication Successful!</h1><p>You can close this window and return to SpecStudio.</p></div></body></html>"
        );
        socket
            .write_all(response.as_bytes())
            .await
            .map_err(|e| format!("Failed to send response: {}", e))?;

        let tokens = exchange_code_for_tokens(
            &code,
            &client_id_str,
            &client_secret_str,
            &format!("http://127.0.0.1:{}", OAUTH_CALLBACK_PORT),
            &token_url_str,
        )
        .await?;

        store_credentials(&app_handle, &provider_str, &tokens).await?;

        Ok::<AuthResult, String>(AuthResult {
            success: true,
            provider: provider_str.clone(),
            message: format!("Successfully authenticated with {}", provider_str),
        })
    })
    .await;

    match result {
        Ok(Ok(auth_result)) => {
            let _ = app.emit(
                "auth:status",
                AuthEvent {
                    provider: provider.to_string(),
                    status: "authenticated".to_string(),
                    message: "Successfully authenticated".to_string(),
                },
            );
            Ok(auth_result)
        }
        Ok(Err(e)) => {
            let _ = app.emit(
                "auth:status",
                AuthEvent {
                    provider: provider.to_string(),
                    status: "error".to_string(),
                    message: e.clone(),
                },
            );
            Err(e)
        }
        Err(_) => {
            let _ = app.emit(
                "auth:status",
                AuthEvent {
                    provider: provider.to_string(),
                    status: "error".to_string(),
                    message: "Authentication timed out".to_string(),
                },
            );
            Err("Authentication timed out after 5 minutes".to_string())
        }
    }
}

async fn check_auth(app: &AppHandle, provider: &str) -> Result<bool, String> {
    match load_credentials(app, provider).await {
        Ok(Some(creds)) => {
            if let Some(expires_at) = creds.expires_at {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                if now >= expires_at {
                    return Ok(creds.refresh_token.is_some());
                }
            }
            Ok(true)
        }
        Ok(None) => Ok(false),
        Err(_) => Ok(false),
    }
}

async fn get_access_token(app: &AppHandle, provider: &str, token_url: &str) -> Result<String, String> {
    let creds = load_credentials(app, provider)
        .await?
        .ok_or(format!("Not authenticated with {}", provider))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    if let Some(expires_at) = creds.expires_at {
        if now >= expires_at - 60 {
            if let Some(refresh_token) = creds.refresh_token {
                // Get credentials from settings store
                let (client_id, client_secret) = get_google_credentials_from_store(app)?;

                let new_creds =
                    refresh_access_token(&refresh_token, &client_id, &client_secret, token_url).await?;
                store_credentials(app, provider, &new_creds).await?;
                return Ok(new_creds.access_token);
            }
            return Err("Token expired and no refresh token available".to_string());
        }
    }

    Ok(creds.access_token)
}

async fn logout(app: &AppHandle, provider: &str) -> Result<(), String> {
    let store = app
        .store("auth.json")
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let key = format!("{}_credentials", provider);
    store.delete(&key);
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    let _ = app.emit(
        "auth:status",
        AuthEvent {
            provider: provider.to_string(),
            status: "logged_out".to_string(),
            message: "Successfully logged out".to_string(),
        },
    );

    Ok(())
}

// ============================================================================
// Helper Functions
// ============================================================================

fn extract_code_from_request(request: &str) -> Result<String, String> {
    let first_line = request.lines().next().ok_or("Empty request")?;

    if let Some(query_start) = first_line.find('?') {
        if let Some(http_start) = first_line[query_start..].find(" HTTP") {
            let query_string = &first_line[query_start + 1..query_start + http_start];

            for param in query_string.split('&') {
                if let Some((key, value)) = param.split_once('=') {
                    if key == "code" {
                        return Ok(urlencoding::decode(value)
                            .map_err(|e| e.to_string())?
                            .into_owned());
                    }
                    if key == "error" {
                        let error_desc = query_string
                            .split('&')
                            .find(|p| p.starts_with("error_description="))
                            .and_then(|p| p.split_once('='))
                            .map(|(_, v)| urlencoding::decode(v).unwrap_or_default().into_owned())
                            .unwrap_or_else(|| value.to_string());
                        return Err(format!("OAuth error: {}", error_desc));
                    }
                }
            }
        }
    }

    Err("No authorization code found in callback".to_string())
}

async fn exchange_code_for_tokens(
    code: &str,
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
    token_url: &str,
) -> Result<OAuthCredentials, String> {
    let client = reqwest::Client::new();

    let mut params = vec![
        ("code", code),
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
    ];

    if !client_secret.is_empty() {
        params.push(("client_secret", client_secret));
    }

    let response = client
        .post(token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to exchange code: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {}", error_text));
    }

    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: String,
        refresh_token: Option<String>,
        expires_in: Option<i64>,
    }

    let token_response: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    let expires_at = token_response.expires_in.map(|expires_in| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
            + expires_in
    });

    Ok(OAuthCredentials {
        access_token: token_response.access_token,
        refresh_token: token_response.refresh_token,
        expires_at,
    })
}

async fn refresh_access_token(
    refresh_token: &str,
    client_id: &str,
    client_secret: &str,
    token_url: &str,
) -> Result<OAuthCredentials, String> {
    let client = reqwest::Client::new();

    let mut params = vec![
        ("refresh_token", refresh_token),
        ("client_id", client_id),
        ("grant_type", "refresh_token"),
    ];

    if !client_secret.is_empty() {
        params.push(("client_secret", client_secret));
    }

    let response = client
        .post(token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed: {}", error_text));
    }

    #[derive(Deserialize)]
    struct RefreshResponse {
        access_token: String,
        expires_in: Option<i64>,
    }

    let refresh_response: RefreshResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    let expires_at = refresh_response.expires_in.map(|expires_in| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
            + expires_in
    });

    Ok(OAuthCredentials {
        access_token: refresh_response.access_token,
        refresh_token: Some(refresh_token.to_string()),
        expires_at,
    })
}

async fn store_credentials(app: &AppHandle, provider: &str, creds: &OAuthCredentials) -> Result<(), String> {
    let store = app
        .store("auth.json")
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let key = format!("{}_credentials", provider);
    store.set(&key, serde_json::to_value(creds).map_err(|e| e.to_string())?);

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

async fn load_credentials(app: &AppHandle, provider: &str) -> Result<Option<OAuthCredentials>, String> {
    let store = app
        .store("auth.json")
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let key = format!("{}_credentials", provider);
    match store.get(&key) {
        Some(value) => {
            let creds: OAuthCredentials =
                serde_json::from_value::<OAuthCredentials>(value.clone()).map_err(|e| e.to_string())?;
            Ok(Some(creds))
        }
        None => Ok(None),
    }
}
