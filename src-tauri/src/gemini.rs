// ============================================================================
// Gemini API Integration
// Handles chat with Google's Gemini API with streaming responses
// ============================================================================

use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub data: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResult {
    pub started: bool,
    pub session_id: String,
}

// Gemini API types
#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(rename = "generationConfig", skip_serializing_if = "Option::is_none")]
    generation_config: Option<GenerationConfig>,
}

#[derive(Debug, Serialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize)]
struct GeminiPart {
    text: String,
}

#[derive(Debug, Serialize)]
struct GenerationConfig {
    temperature: f32,
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct GeminiStreamResponse {
    candidates: Option<Vec<GeminiCandidate>>,
    error: Option<GeminiError>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContentResponse>,
}

#[derive(Debug, Deserialize)]
struct GeminiContentResponse {
    parts: Option<Vec<GeminiPartResponse>>,
}

#[derive(Debug, Deserialize)]
struct GeminiPartResponse {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiError {
    message: String,
    code: Option<i32>,
}

// ============================================================================
// Helper Functions
// ============================================================================

fn get_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn emit_stream_event(app: &AppHandle, event_type: &str, data: &str) {
    let event = StreamEvent {
        event_type: event_type.to_string(),
        data: data.to_string(),
        timestamp: get_timestamp(),
    };
    let _ = app.emit("rpc:stream:data", event);
}

struct GeminiSettings {
    project_id: String,
    region: String,
    api_key: Option<String>,
}

async fn get_settings(app: &AppHandle) -> Result<GeminiSettings, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to open settings store: {}", e))?;

    let project_id = store
        .get("gcpProjectId")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .ok_or("GCP Project ID not configured. Please set it in Settings.")?;

    // GCP region for Vertex AI - defaults to us-central1
    let region = store
        .get("gcpRegion")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "us-central1".to_string());

    // Also try to get API key if available (alternative to OAuth)
    let api_key = store
        .get("geminiApiKey")
        .and_then(|v| v.as_str().map(|s| s.to_string()));

    Ok(GeminiSettings {
        project_id,
        region,
        api_key,
    })
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Start a streaming chat with Gemini
#[tauri::command]
pub async fn chat_with_gemini(
    app: AppHandle,
    prompt: String,
    history: Option<Vec<ChatMessage>>,
    spec_content: Option<String>,
    adr_context: Option<String>,
) -> Result<ChatResult, String> {
    let session_id = format!("chat_{}", get_timestamp());

    // Get settings
    let settings = get_settings(&app).await?;

    // Build the system context
    let mut system_context = String::new();

    if let Some(spec) = &spec_content {
        system_context.push_str("## Current Specification\n");
        system_context.push_str(spec);
        system_context.push_str("\n\n");
    }

    if let Some(adr) = &adr_context {
        system_context.push_str("## Architecture Decision Records\n");
        system_context.push_str(adr);
        system_context.push_str("\n\n");
    }

    // Build Gemini contents from history
    let mut contents: Vec<GeminiContent> = Vec::new();

    // Add system context as first user message if present
    if !system_context.is_empty() {
        contents.push(GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart {
                text: format!(
                    "You are a helpful AI assistant for software development. Here is the context for our conversation:\n\n{}",
                    system_context
                ),
            }],
        });
        contents.push(GeminiContent {
            role: "model".to_string(),
            parts: vec![GeminiPart {
                text: "I understand. I'll help you with your software development tasks based on the provided specification and architecture context. What would you like to work on?".to_string(),
            }],
        });
    }

    // Add conversation history
    if let Some(hist) = history {
        for msg in hist {
            let role = if msg.role == "assistant" {
                "model"
            } else {
                "user"
            };
            contents.push(GeminiContent {
                role: role.to_string(),
                parts: vec![GeminiPart {
                    text: msg.content,
                }],
            });
        }
    }

    // Add current prompt
    contents.push(GeminiContent {
        role: "user".to_string(),
        parts: vec![GeminiPart { text: prompt }],
    });

    let request = GeminiRequest {
        contents,
        generation_config: Some(GenerationConfig {
            temperature: 0.7,
            max_output_tokens: 8192,
        }),
    };

    // Spawn async task to handle streaming
    let app_clone = app.clone();

    tokio::spawn(async move {
        if let Err(e) = stream_gemini_response(&app_clone, settings, request).await {
            emit_stream_event(&app_clone, "error", &e);
            emit_stream_event(&app_clone, "complete", "Chat ended with error");
        }
    });

    Ok(ChatResult {
        started: true,
        session_id,
    })
}

async fn stream_gemini_response(
    app: &AppHandle,
    settings: GeminiSettings,
    request: GeminiRequest,
) -> Result<(), String> {
    let client = Client::new();

    // Build the API URL
    // Using Vertex AI endpoint with project ID, or generativelanguage.googleapis.com with API key
    let (url, auth_header) = if let Some(ref key) = settings.api_key {
        // Use API key auth (simpler, no OAuth needed)
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key={}&alt=sse",
            key
        );
        (url, None)
    } else {
        // Use Vertex AI with OAuth (requires access token)
        let access_token = get_access_token(app).await?;
        let url = format!(
            "https://{}-aiplatform.googleapis.com/v1/projects/{}/locations/{}/publishers/google/models/gemini-1.5-flash:streamGenerateContent?alt=sse",
            settings.region, settings.project_id, settings.region
        );
        (url, Some(format!("Bearer {}", access_token)))
    };

    emit_stream_event(app, "output", "");

    let mut request_builder = client
        .post(&url)
        .header("Content-Type", "application/json");

    if let Some(auth) = auth_header {
        request_builder = request_builder.header("Authorization", auth);
    }

    let response = request_builder
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to send request to Gemini: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Gemini API error: {}", error_text));
    }

    // Stream the response using SSE
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        buffer.push_str(&text);

        // Process complete SSE events
        while let Some(event_end) = buffer.find("\n\n") {
            let event = buffer[..event_end].to_string();
            buffer = buffer[event_end + 2..].to_string();

            // Parse SSE data
            if let Some(data_line) = event.strip_prefix("data: ") {
                if data_line.trim() == "[DONE]" {
                    continue;
                }

                match serde_json::from_str::<GeminiStreamResponse>(data_line) {
                    Ok(response) => {
                        if let Some(error) = response.error {
                            emit_stream_event(app, "error", &error.message);
                            return Err(error.message);
                        }

                        if let Some(candidates) = response.candidates {
                            for candidate in candidates {
                                if let Some(content) = candidate.content {
                                    if let Some(parts) = content.parts {
                                        for part in parts {
                                            if let Some(text) = part.text {
                                                emit_stream_event(app, "output", &text);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to parse Gemini response: {} - {}", e, data_line);
                    }
                }
            }
        }
    }

    emit_stream_event(app, "complete", "Chat completed");
    Ok(())
}

async fn get_access_token(app: &AppHandle) -> Result<String, String> {
    // Try to get access token from auth store
    let store = app
        .store("auth.json")
        .map_err(|e| format!("Failed to open auth store: {}", e))?;

    match store.get("google_credentials") {
        Some(value) => {
            #[derive(Deserialize)]
            struct Credentials {
                access_token: String,
            }

            let creds: Credentials = serde_json::from_value(value.clone())
                .map_err(|_| "Invalid credentials format")?;
            Ok(creds.access_token)
        }
        None => Err("Not authenticated with Google. Please login first or add an API key in settings.".to_string()),
    }
}
