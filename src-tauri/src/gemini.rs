// ============================================================================
// Gemini API Integration (Google AI Studio)
// Handles chat with Google's Gemini API with streaming responses
// Uses API key authentication (no OAuth required)
// ============================================================================

use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

// Default model if none specified
const DEFAULT_MODEL: &str = "gemini-2.5-flash";

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateApiKeyResult {
    pub valid: bool,
    pub error: Option<String>,
}

// Gemini API types
#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(rename = "generationConfig", skip_serializing_if = "Option::is_none")]
    generation_config: Option<GenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<Tool>>,
}

#[derive(Debug, Serialize)]
struct Tool {
    #[serde(rename = "functionDeclarations")]
    function_declarations: Vec<FunctionDeclaration>,
}

#[derive(Debug, Serialize)]
struct FunctionDeclaration {
    name: String,
    description: String,
    parameters: serde_json::Value,
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
    #[serde(rename = "responseMimeType", skip_serializing_if = "Option::is_none")]
    response_mime_type: Option<String>,
    #[serde(rename = "responseSchema", skip_serializing_if = "Option::is_none")]
    response_schema: Option<serde_json::Value>,
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
    #[serde(rename = "functionCall")]
    function_call: Option<FunctionCall>,
}

#[derive(Debug, Deserialize)]
struct FunctionCall {
    name: String,
    args: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct GeminiError {
    message: String,
    code: Option<i32>,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get the JSON schema for Development Plan output
fn get_development_plan_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Overall title of the development plan"
            },
            "overview": {
                "type": "string",
                "description": "High-level overview of what will be built"
            },
            "phases": {
                "type": "array",
                "description": "Development phases in chronological order",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "Phase title"
                        },
                        "description": {
                            "type": "string",
                            "description": "What this phase accomplishes"
                        },
                        "tickets": {
                            "type": "array",
                            "description": "Implementation tickets for this phase",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {
                                        "type": "string",
                                        "description": "Unique ticket identifier (e.g., SPEC-001)"
                                    },
                                    "title": {
                                        "type": "string",
                                        "description": "Ticket title"
                                    },
                                    "requirements": {
                                        "type": "array",
                                        "description": "Technical requirements",
                                        "items": {
                                            "type": "string"
                                        }
                                    },
                                    "acceptance_criteria": {
                                        "type": "array",
                                        "description": "Acceptance criteria for completion",
                                        "items": {
                                            "type": "string"
                                        }
                                    }
                                },
                                "required": ["id", "title", "requirements", "acceptance_criteria"]
                            }
                        }
                    },
                    "required": ["title", "description", "tickets"]
                }
            }
        },
        "required": ["title", "overview", "phases"]
    })
}

/// Get the search_files tool definition
fn get_search_files_tool() -> Tool {
    Tool {
        function_declarations: vec![FunctionDeclaration {
            name: "search_files".to_string(),
            description: "Search for files in the workspace by content. Use this to understand the existing codebase structure, find similar implementations, or locate relevant files before creating a development plan.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query string to find in file contents"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return (default: 50)",
                        "default": 50
                    }
                },
                "required": ["query"]
            }),
        }],
    }
}

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
    api_key: String,
    model: String,
}

async fn get_settings(app: &AppHandle) -> Result<GeminiSettings, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to open settings store: {}", e))?;

    let api_key = store
        .get("geminiApiKey")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
        .ok_or("Gemini API key not configured. Please set it in Settings.")?;

    let model = store
        .get("geminiModel")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());

    Ok(GeminiSettings { api_key, model })
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
) -> Result<ChatResult, String> {
    let session_id = format!("chat_{}", get_timestamp());

    // Get settings
    let settings = get_settings(&app).await?;

    // Build the system context with Architect persona
    let mut system_context = String::new();

    system_context.push_str(r#"# Role: Software Architect

You are an expert Software Architect specializing in creating comprehensive development plans.

## Your Mission
1. Discuss requirements and architecture in MARKDOWN
2. Only generate a JSON Development Plan when the user sends the specific trigger phrase

## Output Format
Default to Markdown. Only output strict JSON when the prompt specifically asks to 'Create a comprehensive development plan'.

When generating JSON, use this structure:
- title: Overall plan title
- overview: High-level description
- phases: Array of development phases
  - Each phase has: title, description, tickets
  - Each ticket has: id, title, requirements[], acceptance_criteria[]

## Guidelines
- Break complex features into logical phases
- Each ticket should be independently implementable
- Use clear, actionable language in requirements
- Define measurable acceptance criteria
- Consider dependencies between tickets

## Tools Available
- search_files: Search the codebase to understand existing patterns and structure
"#);

    if let Some(spec) = &spec_content {
        system_context.push_str("\n## Current Specification\n");
        system_context.push_str(spec);
        system_context.push_str("\n\n");
    }

    // Build Gemini contents from history
    let mut contents: Vec<GeminiContent> = Vec::new();

    // Add system context as first user message
    contents.push(GeminiContent {
        role: "user".to_string(),
        parts: vec![GeminiPart {
            text: system_context,
        }],
    });
    contents.push(GeminiContent {
        role: "model".to_string(),
        parts: vec![GeminiPart {
            text: "I understand. I'm ready to help you architect your solution. I can explore your codebase using search_files and create structured development plans when you're ready. What would you like to discuss?".to_string(),
        }],
    });

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
        parts: vec![GeminiPart { text: prompt.clone() }],
    });

    // Detect if user is requesting a plan (enable strict JSON output)
    // CRITICAL: This must match the exact phrase from ide-layout.tsx handleCreatePlan
    let requesting_plan = prompt.contains("Create a comprehensive development plan");

    // Configure generation with optional strict JSON schema
    let generation_config = if requesting_plan {
        GenerationConfig {
            temperature: 0.7,
            max_output_tokens: 8192,
            response_mime_type: Some("application/json".to_string()),
            response_schema: Some(get_development_plan_schema()),
        }
    } else {
        GenerationConfig {
            temperature: 0.7,
            max_output_tokens: 8192,
            response_mime_type: None,
            response_schema: None,
        }
    };

    // Tools cannot be used with JSON response mode (Gemini API limitation)
    let tools = if requesting_plan {
        None
    } else {
        Some(vec![get_search_files_tool()])
    };

    let request = GeminiRequest {
        contents,
        generation_config: Some(generation_config),
        tools,
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

    // Build the API URL for Google AI Studio
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?key={}&alt=sse",
        settings.model, settings.api_key
    );

    emit_stream_event(app, "output", "");

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
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
    let mut received_any_content = false;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        buffer.push_str(&text);

        // Process complete SSE events (handle both \n\n and \r\n\r\n)
        loop {
            // Find the next event boundary
            let event_end = buffer.find("\n\n")
                .or_else(|| buffer.find("\r\n\r\n"));

            let (end_pos, skip_len) = match event_end {
                Some(pos) if buffer[pos..].starts_with("\r\n\r\n") => (pos, 4),
                Some(pos) => (pos, 2),
                None => break,
            };

            let event = buffer[..end_pos].to_string();
            buffer = buffer[end_pos + skip_len..].to_string();

            // Parse SSE data - handle multiple formats
            let data_line = event
                .strip_prefix("data: ")
                .or_else(|| event.strip_prefix("data:"))
                .or_else(|| {
                    // Sometimes the data is on a line after "data:"
                    event.lines()
                        .find(|line| line.starts_with("data:") || line.starts_with("data: "))
                        .and_then(|line| line.strip_prefix("data: ").or_else(|| line.strip_prefix("data:")))
                });

            if let Some(data_line) = data_line {
                let data_line = data_line.trim();

                if data_line == "[DONE]" || data_line.is_empty() {
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
                                            // Handle text output
                                            if let Some(text) = part.text {
                                                if !text.is_empty() {
                                                    received_any_content = true;
                                                    emit_stream_event(app, "output", &text);
                                                }
                                            }

                                            // Handle tool calls
                                            if let Some(function_call) = part.function_call {
                                                received_any_content = true;
                                                let tool_call_json = serde_json::json!({
                                                    "name": function_call.name,
                                                    "args": function_call.args
                                                });
                                                emit_stream_event(
                                                    app,
                                                    "tool_call",
                                                    &serde_json::to_string(&tool_call_json).unwrap_or_default()
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to parse Gemini response: {} - {}", e, data_line);
                        // Show parse errors to user for debugging
                        emit_stream_event(app, "error", &format!("Parse error: {} (data: {}...)", e, &data_line[..data_line.len().min(100)]));
                    }
                }
            }
        }
    }

    // Check if we received any content
    if !received_any_content {
        // Check if there's remaining data in buffer
        if !buffer.trim().is_empty() {
            emit_stream_event(app, "error", &format!("Incomplete response. Remaining buffer: {}...", &buffer[..buffer.len().min(200)]));
        } else {
            emit_stream_event(app, "error", "No content received from Gemini API");
        }
    }

    emit_stream_event(app, "complete", "Chat completed");
    Ok(())
}

/// Validate a Gemini API key by making a test request
#[tauri::command]
pub async fn validate_gemini_api_key(api_key: String) -> Result<ValidateApiKeyResult, String> {
    let client = Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        api_key
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if response.status().is_success() {
        Ok(ValidateApiKeyResult {
            valid: true,
            error: None,
        })
    } else {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        Ok(ValidateApiKeyResult {
            valid: false,
            error: Some(format!("Invalid API key ({}): {}", status, error_text)),
        })
    }
}

