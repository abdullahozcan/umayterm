use std::path::PathBuf;

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

const MAX_MESSAGES: usize = 120;
const MAX_PARTS: usize = 400;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpencodePart {
    pub id: String,
    pub r#type: String,
    pub text: Option<String>,
    pub tool: Option<String>,
    pub status: Option<String>,
    pub time_created: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpencodeMessage {
    pub id: String,
    pub role: String,
    pub agent: Option<String>,
    pub model: Option<String>,
    pub time_created: i64,
    pub parts: Vec<OpencodePart>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpencodeSession {
    pub id: String,
    pub title: String,
    pub directory: String,
    pub parent_id: Option<String>,
    pub time_created: i64,
    pub time_updated: i64,
    pub messages: Vec<OpencodeMessage>,
    pub children: Vec<OpencodeSession>,
}

fn opencode_db_path() -> Option<PathBuf> {
    let base = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .ok()
        .filter(|p| !p.as_os_str().is_empty())
        .or_else(|| {
            std::env::var("HOME")
                .ok()
                .map(|h| PathBuf::from(h).join(".local/share"))
        })?;
    let p = base.join("opencode").join("opencode.db");
    if p.exists() { Some(p) } else { None }
}

fn open_ro(path: &PathBuf) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("opencode.db açılamadı: {e}"))?;
    let _ = conn.busy_timeout(std::time::Duration::from_millis(200));
    Ok(conn)
}

fn json_str(v: &serde_json::Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
}

fn load_parts(conn: &Connection, message_id: &str) -> Result<Vec<OpencodePart>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, data, time_created FROM part WHERE message_id=?1 ORDER BY time_created ASC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![message_id, MAX_PARTS as i64], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let (id, data, tc) = row.map_err(|e| e.to_string())?;
        let v: serde_json::Value = serde_json::from_str(&data).unwrap_or(serde_json::Value::Null);
        let typ = json_str(&v, "type").unwrap_or_else(|| "unknown".to_string());
        if typ == "step-start" || typ == "step-end" {
            continue;
        }
        let text = json_str(&v, "text");
        let tool = json_str(&v, "tool");
        let status = v
            .get("state")
            .and_then(|s| s.get("status"))
            .and_then(|s| s.as_str())
            .map(|s| s.to_string());
        out.push(OpencodePart {
            id,
            r#type: typ,
            text,
            tool,
            status,
            time_created: tc,
        });
    }
    Ok(out)
}

fn load_messages(conn: &Connection, session_id: &str) -> Result<Vec<OpencodeMessage>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, data, time_created FROM message WHERE session_id=?1 ORDER BY time_created ASC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![session_id, MAX_MESSAGES as i64], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let (id, data, tc) = row.map_err(|e| e.to_string())?;
        let v: serde_json::Value = serde_json::from_str(&data).unwrap_or(serde_json::Value::Null);
        let role = json_str(&v, "role").unwrap_or_else(|| "assistant".to_string());
        let agent = json_str(&v, "agent");
        let model = v
            .get("model")
            .and_then(|m| m.get("modelID"))
            .and_then(|m| m.as_str())
            .map(|s| s.to_string());
        let parts = load_parts(conn, &id)?;
        out.push(OpencodeMessage {
            id,
            role,
            agent,
            model,
            time_created: tc,
            parts,
        });
    }
    Ok(out)
}

fn load_session(conn: &Connection, id: &str, depth: usize) -> Result<Option<OpencodeSession>, String> {
    let row = conn
        .query_row(
            "SELECT id, title, directory, parent_id, time_created, time_updated FROM session WHERE id=?1",
            rusqlite::params![id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, i64>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((sid, title, directory, parent_id, tc, tu)) = row else {
        return Ok(None);
    };
    let mut children = Vec::new();
    if depth < 3 {
        let mut stmt = conn
            .prepare(
                "SELECT id FROM session WHERE parent_id=?1 ORDER BY time_created ASC LIMIT 20",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for r in rows {
            let cid = r.map_err(|e| e.to_string())?;
            if let Some(child) = load_session(conn, &cid, depth + 1)? {
                children.push(child);
            }
        }
    }
    Ok(Some(OpencodeSession {
        id: sid,
        title: title.unwrap_or_default(),
        directory: directory.unwrap_or_default(),
        parent_id,
        time_created: tc,
        time_updated: tu,
        messages: load_messages(conn, id)?,
        children,
    }))
}

#[tauri::command]
pub fn opencode_probe(directory: Option<String>) -> Result<Option<OpencodeSession>, String> {
    let Some(db) = opencode_db_path() else {
        return Ok(None);
    };
    let conn = open_ro(&db)?;
    let root_id: Option<String> = match directory {
        Some(dir) if !dir.is_empty() => conn
            .query_row(
                "SELECT id FROM session WHERE directory=?1 AND parent_id IS NULL ORDER BY time_updated DESC LIMIT 1",
                rusqlite::params![dir],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?,
        _ => conn
            .query_row(
                "SELECT id FROM session WHERE parent_id IS NULL ORDER BY time_updated DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?,
    };
    let Some(id) = root_id else {
        return Ok(None);
    };
    load_session(&conn, &id, 0)
}