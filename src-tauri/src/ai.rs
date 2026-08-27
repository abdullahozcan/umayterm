use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::store::{settings_get, Store};

const AI_BASE_URL: &str = "https://openrouter.ai/api/v1";
const AI_KEYRING: &str = "ai:openrouter";
const AI_KEY_SETTING: &str = "aiKey";
const AI_KEY_SET_FLAG: &str = "aiKeySet";

#[derive(Default)]
pub struct AiManager {
    current: Mutex<Option<tokio::task::AbortHandle>>,
}

fn ai_key_get(conn: &Connection) -> Option<String> {
    if let Ok(entry) = keyring::Entry::new(crate::store::KEYRING_SERVICE, AI_KEYRING) {
        if let Ok(v) = entry.get_password() {
            if !v.is_empty() {
                return Some(v);
            }
        }
    }
    settings_get(conn, AI_KEY_SETTING)
}

fn settings_set_conn(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value=?2, updated_at=datetime('now')",
        params![key, value],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

fn openrouter_error(body: &str, status: reqwest::StatusCode) -> String {
    let msg = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| body.chars().take(300).collect());
    format!("OpenRouter hatası ({status}): {msg}")
}

#[tauri::command]
pub fn ai_key_set(state: State<'_, Store>, key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("Anahtar boş olamaz".to_string());
    }
    let mut stored = false;
    if let Ok(entry) = keyring::Entry::new(crate::store::KEYRING_SERVICE, AI_KEYRING) {
        if entry.set_password(&key).is_ok() {
            stored = true;
        }
    }
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    if !stored {
        settings_set_conn(&conn, AI_KEY_SETTING, &key)?;
    }
    settings_set_conn(&conn, AI_KEY_SET_FLAG, "1")?;
    Ok(())
}

#[tauri::command]
pub fn ai_key_clear(state: State<'_, Store>) -> Result<(), String> {
    if let Ok(entry) = keyring::Entry::new(crate::store::KEYRING_SERVICE, AI_KEYRING) {
        let _ = entry.delete_credential();
    }
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    conn.execute("DELETE FROM settings WHERE key IN (?1, ?2)", params![AI_KEY_SETTING, AI_KEY_SET_FLAG])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn ai_key_has(state: State<'_, Store>) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    Ok(ai_key_get(&conn).is_some())
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiModelInfo {
    pub id: String,
    pub name: Option<String>,
}

#[derive(Deserialize)]
struct OpenRouterModels {
    data: Vec<OpenRouterModel>,
}

#[derive(Deserialize)]
struct OpenRouterModel {
    id: String,
    name: Option<String>,
}

#[tauri::command]
pub async fn ai_models(state: State<'_, Store>) -> Result<Vec<AiModelInfo>, String> {
    let key = {
        let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
        ai_key_get(&conn).ok_or_else(|| "OpenRouter anahtarı tanımlı değil".to_string())?
    };
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{AI_BASE_URL}/models"))
        .bearer_auth(&key)
        .send()
        .await
        .map_err(|e| format!("Model listesi alınamadı: {e}"))?;
    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Yanıt okunamadı: {e}"))?;
    if !status.is_success() {
        return Err(openrouter_error(&body, status));
    }
    let parsed: OpenRouterModels =
        serde_json::from_str(&body).map_err(|e| format!("Model listesi ayrıştırılamadı: {e}"))?;
    Ok(parsed
        .data
        .into_iter()
        .map(|m| AiModelInfo { id: m.id, name: m.name })
        .collect())
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum AiEvent {
    Chunk { content: String },
    Done,
    Error { message: String },
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<AiMessage>,
    stream: bool,
}

#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    state: State<'_, Store>,
    model: String,
    messages: Vec<AiMessage>,
    on_event: tauri::ipc::Channel<AiEvent>,
) -> Result<(), String> {
    if model.trim().is_empty() {
        return Err("Model seçilmeli".to_string());
    }
    let key = {
        let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
        ai_key_get(&conn).ok_or_else(|| "OpenRouter anahtarı tanımlı değil".to_string())?
    };

    let client = reqwest::Client::new();
    let req = client
        .post(format!("{AI_BASE_URL}/chat/completions"))
        .bearer_auth(&key)
        .header("HTTP-Referer", "https://umayterm.app")
        .header("X-Title", "UmayTerm")
        .json(&ChatRequest {
            model,
            messages,
            stream: true,
        })
        .send()
        .await
        .map_err(|e| format!("İstek gönderilemedi: {e}"))?;

    let status = req.status();
    if !status.is_success() {
        let body = req.text().await.unwrap_or_default();
        let _ = on_event.send(AiEvent::Error {
            message: openrouter_error(&body, status),
        });
        return Ok(());
    }

    let done_channel = on_event.clone();
    let task = tokio::spawn(async move {
        let mut stream = req.bytes_stream();
        let mut buf = Vec::new();
        let mut done = false;
        while let Some(chunk) = stream.next().await {
            if done {
                break;
            }
            let Ok(chunk) = chunk else {
                break;
            };
            buf.extend_from_slice(&chunk);
            while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                let line: Vec<u8> = buf.drain(..=pos).collect();
                let line = String::from_utf8_lossy(&line);
                let line = line.trim();
                if line.is_empty() || !line.starts_with("data:") {
                    continue;
                }
                let payload = line.trim_start_matches("data:").trim();
                if payload == "[DONE]" {
                    done = true;
                    break;
                }
                let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) else {
                    continue;
                };
                if let Some(err) = value.get("error").and_then(|e| e["message"].as_str()) {
                    let _ = on_event.send(AiEvent::Error {
                        message: err.to_string(),
                    });
                    done = true;
                    break;
                }
                if let Some(content) = value["choices"][0]["delta"]["content"].as_str() {
                    if !content.is_empty() {
                        let _ = on_event.send(AiEvent::Chunk {
                            content: content.to_string(),
                        });
                    }
                }
            }
        }
    });

    if let Some(mgr) = app.try_state::<Arc<AiManager>>() {
        if let Ok(mut cur) = mgr.current.lock() {
            *cur = Some(task.abort_handle());
        }
    }
    let _ = task.await;
    if let Some(mgr) = app.try_state::<Arc<AiManager>>() {
        if let Ok(mut cur) = mgr.current.lock() {
            *cur = None;
        }
    }
    let _ = done_channel.send(AiEvent::Done);
    Ok(())
}

#[tauri::command]
pub fn ai_stop(app: AppHandle) {
    if let Some(mgr) = app.try_state::<Arc<AiManager>>() {
        if let Ok(mut cur) = mgr.current.lock() {
            if let Some(h) = cur.take() {
                h.abort();
            }
        }
    }
}