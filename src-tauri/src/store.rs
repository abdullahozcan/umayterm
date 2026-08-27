use std::path::PathBuf;
use std::sync::Mutex;

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

pub(crate) const KEYRING_SERVICE: &str = "com.opade.umayterm";
const LOCK_SALT_KEY: &str = "lockSalt";
const LOCK_HASH_KEY: &str = "lockHash";

fn hash_master_password(password: &str, salt: &SaltString) -> Result<String, String> {
    Argon2::default()
        .hash_password(password.as_bytes(), salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("Parola karma hesaplanamadı: {e}"))
}

fn verify_master_password(conn: &Connection, password: &str) -> Result<bool, String> {
    let hash = settings_get(conn, LOCK_HASH_KEY).unwrap_or_default();
    if hash.is_empty() {
        return Ok(false);
    }
    let parsed = PasswordHash::new(&hash).map_err(|e| format!("Karma ayrıştırılamadı: {e}"))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

fn keyring_entry(id: i64, kind: &str) -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("host:{id}:{kind}")).ok()
}

fn secret_get(id: i64, kind: &str) -> Option<String> {
    keyring_entry(id, kind).and_then(|e| e.get_password().ok())
}

fn secret_set(id: i64, kind: &str, secret: &str) -> Result<(), String> {
    let entry = keyring_entry(id, kind)
        .ok_or_else(|| "Parola saklama servisine erişilemiyor (keyring)".to_string())?;
    entry
        .set_password(secret)
        .map_err(|e| format!("Parola keyring'e kaydedilemedi: {e}"))
}

fn secret_delete(id: i64, kind: &str) {
    if let Some(entry) = keyring_entry(id, kind) {
        let _ = entry.delete_credential();
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HostRecord {
    pub id: Option<i64>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub key_path: Option<String>,
    pub password: Option<String>,
    pub passphrase: Option<String>,
    pub group_name: String,
    pub tags: String,
    pub jump_host: Option<String>,
    pub jump_port: Option<u16>,
    pub jump_user: Option<String>,
    pub jump_password: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

pub struct Store {
    pub conn: Mutex<Connection>,
}

fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Veri dizini bulunamadı: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Veri dizini oluşturulamadı: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    }
    let path = dir.join("umayterm.db");
    let conn = Connection::open(&path).map_err(|e| format!("Veritabanı açılamadı: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS hosts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL DEFAULT 22,
            username TEXT NOT NULL,
            auth_method TEXT NOT NULL DEFAULT 'password',
            key_path TEXT,
            password TEXT,
            passphrase TEXT,
            group_name TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS snippets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            command TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS host_keys (
            host TEXT NOT NULL,
            port INTEGER NOT NULL DEFAULT 22,
            fingerprint TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (host, port)
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )
    .map_err(|e| format!("Tablo oluşturulamadı: {e}"))?;

    migrate_jump_columns(&conn);
    migrate_plaintext_secrets(&conn);
    Ok(conn)
}

fn migrate_jump_columns(conn: &Connection) {
    let cols: Vec<String> = conn
        .prepare("PRAGMA table_info(hosts)")
        .map(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .map(|it| it.filter_map(|r| r.ok()).collect())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    for (name, ddl) in [
        ("jump_host", "ALTER TABLE hosts ADD COLUMN jump_host TEXT NOT NULL DEFAULT ''"),
        ("jump_port", "ALTER TABLE hosts ADD COLUMN jump_port INTEGER NOT NULL DEFAULT 22"),
        ("jump_user", "ALTER TABLE hosts ADD COLUMN jump_user TEXT NOT NULL DEFAULT ''"),
    ] {
        if !cols.contains(&name.to_string()) {
            let _ = conn.execute(ddl, []);
        }
    }
}

fn migrate_plaintext_secrets(conn: &Connection) {
    let mut stmt = match conn.prepare("SELECT id, password, passphrase FROM hosts WHERE password != '' OR passphrase != ''") {
        Ok(s) => s,
        Err(_) => return,
    };
    let rows: Vec<(i64, Option<String>, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map(|it| it.filter_map(|r| r.ok()).collect())
        .unwrap_or_default();
    drop(stmt);
    for (id, password, passphrase) in rows {
        if let Some(p) = password {
            if !p.is_empty() {
                let _ = secret_set(id, "password", &p);
            }
        }
        if let Some(p) = passphrase {
            if !p.is_empty() {
                let _ = secret_set(id, "passphrase", &p);
            }
        }
    }
    let _ = conn.execute("UPDATE hosts SET password = '', passphrase = ''", []);
}

pub fn init(app: &tauri::AppHandle) -> Result<Store, String> {
    Ok(Store {
        conn: Mutex::new(open_db(app)?),
    })
}

fn row_to_host(row: &rusqlite::Row) -> rusqlite::Result<HostRecord> {
    let id: Option<i64> = row.get(0)?;
    Ok(HostRecord {
        id,
        name: row.get(1)?,
        host: row.get(2)?,
        port: row.get(3)?,
        username: row.get(4)?,
        auth_method: row.get(5)?,
        key_path: row.get(6)?,
        password: row.get(7)?,
        passphrase: row.get(8)?,
        group_name: row.get(9)?,
        tags: row.get(10)?,
        jump_host: row.get(11)?,
        jump_port: row.get(12)?,
        jump_user: row.get(13)?,
        jump_password: None,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

#[tauri::command]
pub fn host_list(state: State<'_, Store>) -> Result<Vec<HostRecord>, String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, host, port, username, auth_method, key_path, password,
                    passphrase, group_name, tags, jump_host, jump_port, jump_user,
                    created_at, updated_at
             FROM hosts ORDER BY group_name, name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_host).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        let mut host = r.map_err(|e| e.to_string())?;
        if let Some(id) = host.id {
            if host.password.is_none() || host.password.as_deref() == Some("") {
                host.password = secret_get(id, "password");
            }
            if host.passphrase.is_none() || host.passphrase.as_deref() == Some("") {
                host.passphrase = secret_get(id, "passphrase");
            }
            if host.jump_user.as_deref().unwrap_or("") != "" {
                host.jump_password = secret_get(id, "jump_password");
            }
        }
        out.push(host);
    }
    Ok(out)
}

#[tauri::command]
pub fn host_list_safe(state: State<'_, Store>) -> Result<Vec<HostRecord>, String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, host, port, username, auth_method, key_path, password,
                    passphrase, group_name, tags, jump_host, jump_port, jump_user,
                    created_at, updated_at
             FROM hosts ORDER BY group_name, name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_host).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        let mut host = r.map_err(|e| e.to_string())?;
        host.password = None;
        host.passphrase = None;
        host.jump_password = None;
        out.push(host);
    }
    Ok(out)
}

#[tauri::command]
pub fn host_get_secrets(state: State<'_, Store>, id: i64) -> Result<HostRecord, String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    let mut host = conn
        .query_row(
            "SELECT id, name, host, port, username, auth_method, key_path, password,
                    passphrase, group_name, tags, jump_host, jump_port, jump_user,
                    created_at, updated_at
             FROM hosts WHERE id=?1",
            params![id],
            row_to_host,
        )
        .map_err(|e| format!("Host bulunamadı: {e}"))?;
    if host.password.is_none() || host.password.as_deref() == Some("") {
        host.password = secret_get(id, "password");
    }
    if host.passphrase.is_none() || host.passphrase.as_deref() == Some("") {
        host.passphrase = secret_get(id, "passphrase");
    }
    if host.jump_user.as_deref().unwrap_or("") != "" {
        host.jump_password = secret_get(id, "jump_password");
    }
    Ok(host)
}

#[tauri::command]
pub fn host_save(state: State<'_, Store>, host: HostRecord) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    match host.id {
        Some(id) => {
            conn.execute(
                "UPDATE hosts SET name=?1, host=?2, port=?3, username=?4, auth_method=?5,
                        key_path=?6, group_name=?7, tags=?8, jump_host=?9, jump_port=?10,
                        jump_user=?11, updated_at=datetime('now')
                 WHERE id=?12",
                params![
                    host.name,
                    host.host,
                    host.port,
                    host.username,
                    host.auth_method,
                    host.key_path,
                    host.group_name,
                    host.tags,
                    host.jump_host.as_deref().unwrap_or(""),
                    host.jump_port.unwrap_or(22),
                    host.jump_user.as_deref().unwrap_or(""),
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
            update_secrets(id, &host)?;
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO hosts (name, host, port, username, auth_method, key_path,
                                    group_name, tags, jump_host, jump_port, jump_user)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    host.name,
                    host.host,
                    host.port,
                    host.username,
                    host.auth_method,
                    host.key_path,
                    host.group_name,
                    host.tags,
                    host.jump_host.as_deref().unwrap_or(""),
                    host.jump_port.unwrap_or(22),
                    host.jump_user.as_deref().unwrap_or("")
                ],
            )
            .map_err(|e| e.to_string())?;
            let id = conn.last_insert_rowid();
            update_secrets(id, &host)?;
            Ok(id)
        }
    }
}

fn update_secrets(id: i64, host: &HostRecord) -> Result<(), String> {
    let mut problems = Vec::new();
    match host.password.as_deref() {
        Some(p) if !p.is_empty() => {
            if let Err(e) = secret_set(id, "password", p) {
                problems.push(format!("parola: {e}"));
            }
        }
        _ => secret_delete(id, "password"),
    }
    match host.passphrase.as_deref() {
        Some(p) if !p.is_empty() => {
            if let Err(e) = secret_set(id, "passphrase", p) {
                problems.push(format!("anahtar parolası: {e}"));
            }
        }
        _ => secret_delete(id, "passphrase"),
    }
    match host.jump_password.as_deref() {
        Some(p) if !p.is_empty() => {
            if let Err(e) = secret_set(id, "jump_password", p) {
                problems.push(format!("jump parolası: {e}"));
            }
        }
        _ => secret_delete(id, "jump_password"),
    }
    if problems.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Host kaydedildi ancak parola keyring'e yazılamadı: {}",
            problems.join("; ")
        ))
    }
}

#[tauri::command]
pub fn host_delete(state: State<'_, Store>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    conn.execute("DELETE FROM hosts WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    secret_delete(id, "password");
    secret_delete(id, "passphrase");
    secret_delete(id, "jump_password");
    Ok(())
}

#[tauri::command]
pub fn hosts_export(state: State<'_, Store>) -> Result<String, String> {
    let hosts = host_list(state)?;
    let clean: Vec<HostRecord> = hosts
        .into_iter()
        .map(|mut h| {
            h.id = None;
            h.password = None;
            h.passphrase = None;
            h.jump_password = None;
            h.created_at = None;
            h.updated_at = None;
            h
        })
        .collect();
    serde_json::to_string_pretty(&clean).map_err(|e| e.to_string())
}

fn insert_host_if_new(
    state: &tauri::State<'_, Store>,
    mut host: HostRecord,
) -> bool {
    let dup = {
        let Ok(conn) = state.conn.lock() else {
            return false;
        };
        conn.query_row(
            "SELECT COUNT(*) FROM hosts WHERE host=?1 AND port=?2 AND username=?3",
            params![host.host, host.port, host.username],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
    };
    if dup > 0 {
        return false;
    }
    host.id = None;
    host.created_at = None;
    host.updated_at = None;
    host_save(state.clone(), host).is_ok()
}

#[tauri::command]
pub fn hosts_import(
    state: State<'_, Store>,
    hosts: Vec<HostRecord>,
) -> Result<usize, String> {
    let mut imported = 0;
    for h in hosts {
        if h.name.trim().is_empty() || h.host.trim().is_empty() || h.username.trim().is_empty() {
            continue;
        }
        if insert_host_if_new(&state, h) {
            imported += 1;
        }
    }
    Ok(imported)
}

#[tauri::command]
pub fn ssh_config_import(state: State<'_, Store>) -> Result<usize, String> {
    let home =
        std::env::var("HOME").map_err(|_| "HOME ortam değişkeni bulunamadı".to_string())?;
    let path = PathBuf::from(&home).join(".ssh").join("config");
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("~/.ssh/config okunamadı: {e}"))?;

    let mut hosts: Vec<HostRecord> = Vec::new();
    let mut current: Option<HostRecord> = None;

    for raw in content.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(2, char::is_whitespace);
        let key = parts.next().unwrap_or("").to_lowercase();
        let value = parts.next().unwrap_or("").trim();
        if value.is_empty() {
            continue;
        }
        if key == "host" {
            if let Some(h) = current.take() {
                hosts.push(h);
            }
            if value.contains('*') || value.contains('?') {
                continue;
            }
            current = Some(HostRecord {
                id: None,
                name: value.to_string(),
                host: value.to_string(),
                port: 22,
                username: String::new(),
                auth_method: "password".to_string(),
                key_path: None,
                password: None,
                passphrase: None,
                group_name: String::new(),
                tags: String::new(),
                jump_host: None,
                jump_port: None,
                jump_user: None,
                jump_password: None,
                created_at: None,
                updated_at: None,
            });
            continue;
        }
        let Some(h) = current.as_mut() else { continue };
        match key.as_str() {
            "hostname" => h.host = value.to_string(),
            "user" => h.username = value.to_string(),
            "port" => {
                if let Ok(p) = value.parse::<u16>() {
                    h.port = p;
                }
            }
            "identityfile" => {
                let expanded = if let Some(rest) = value.strip_prefix("~/") {
                    format!("{home}/{rest}")
                } else {
                    value.to_string()
                };
                h.key_path = Some(expanded);
                h.auth_method = "key".to_string();
            }
            "proxyjump" => {
                let jump_value = if let Some(rest) = value.strip_prefix("~/") {
                    format!("{home}/{rest}")
                } else {
                    value.to_string()
                };
                let jump_parts: Vec<&str> = jump_value.split('@').collect();
                if jump_parts.len() == 2 {
                    h.jump_user = Some(jump_parts[0].to_string());
                    let host_port: Vec<&str> = jump_parts[1].split(':').collect();
                    h.jump_host = Some(host_port[0].to_string());
                    h.jump_port = host_port.get(1).and_then(|p| p.parse::<u16>().ok());
                } else {
                    let host_port: Vec<&str> = jump_value.split(':').collect();
                    h.jump_host = Some(host_port[0].to_string());
                    h.jump_port = host_port.get(1).and_then(|p| p.parse::<u16>().ok());
                }
            }
            "proxycommand" => {
                if value == "none" {
                    continue;
                }
                let cmd = value.to_string();
                if cmd.contains("ssh") && cmd.contains("-W") {
                    if let Some(jump_host) = cmd.split("-W").nth(1) {
                        let host_port: Vec<&str> = jump_host.trim().split(':').collect();
                        h.jump_host = Some(host_port[0].trim().to_string());
                        h.jump_port = host_port.get(1).and_then(|p| p.parse::<u16>().ok());
                    }
                }
            }
            "forwardagent" => {
                if value.to_lowercase() == "yes" {
                    h.tags = if h.tags.is_empty() {
                        "forward-agent".to_string()
                    } else {
                        format!("{},forward-agent", h.tags)
                    };
                }
            }
            _ => {}
        }
    }
    if let Some(h) = current.take() {
        hosts.push(h);
    }

    let mut imported = 0;
    for h in hosts {
        if h.username.is_empty() {
            continue;
        }
        if insert_host_if_new(&state, h) {
            imported += 1;
        }
    }
    Ok(imported)
}

pub fn host_key_get(conn: &Connection, host: &str, port: u16) -> Option<String> {
    conn.query_row(
        "SELECT fingerprint FROM host_keys WHERE host=?1 AND port=?2",
        params![host, port],
        |row| row.get(0),
    )
    .ok()
}

pub fn host_key_save(conn: &Connection, host: &str, port: u16, fingerprint: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO host_keys (host, port, fingerprint) VALUES (?1, ?2, ?3)
         ON CONFLICT(host, port) DO UPDATE SET fingerprint=?3, created_at=datetime('now')",
        params![host, port, fingerprint],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn settings_get(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key=?1",
        params![key],
        |row| row.get(0),
    )
    .ok()
}

#[tauri::command]
pub fn settings_get_all(state: State<'_, Store>) -> Result<std::collections::HashMap<String, String>, String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut out = std::collections::HashMap::new();
    for r in rows {
        let (k, v) = r.map_err(|e| e.to_string())?;
        out.insert(k, v);
    }
    Ok(out)
}

#[tauri::command]
pub fn settings_set(state: State<'_, Store>, key: String, value: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value=?2, updated_at=datetime('now')",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn lock_status(state: State<'_, Store>) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    Ok(!settings_get(&conn, LOCK_HASH_KEY).unwrap_or_default().is_empty())
}

#[tauri::command]
pub fn lock_setup(
    state: State<'_, Store>,
    current: Option<String>,
    new_password: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    if new_password.len() < 4 {
        return Err("Parola en az 4 karakter olmalı".to_string());
    }
    if let Some(cur) = current {
        if !verify_master_password(&conn, &cur)? {
            return Err("Mevcut parola hatalı".to_string());
        }
    } else if !settings_get(&conn, LOCK_HASH_KEY).unwrap_or_default().is_empty() {
        return Err("Parola zaten tanımlı. Değiştirmek için mevcut parolayı girin.".to_string());
    }
    let salt = secure_salt();
    let hash = hash_master_password(&new_password, &salt)?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value=?2, updated_at=datetime('now')",
        params![LOCK_SALT_KEY, salt.as_str()],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value=?2, updated_at=datetime('now')",
        params![LOCK_HASH_KEY, hash],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn lock_verify(state: State<'_, Store>, password: String) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    verify_master_password(&conn, &password)
}

#[tauri::command]
pub fn lock_clear(state: State<'_, Store>, current: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    if !verify_master_password(&conn, &current)? {
        return Err("Mevcut parola hatalı".to_string());
    }
    conn.execute("DELETE FROM settings WHERE key IN (?1, ?2)", params![LOCK_SALT_KEY, LOCK_HASH_KEY])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn secure_salt() -> SaltString {
    SaltString::generate(&mut rand_core::OsRng)
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SerializedSession {
    pub kind: String,
    pub title: String,
    pub color: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
}

fn sessions_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Veri dizini bulunamadı: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Veri dizini oluşturulamadı: {e}"))?;
    Ok(dir.join("sessions.json"))
}

#[tauri::command]
pub fn session_save(app: tauri::AppHandle, sessions: Vec<SerializedSession>) -> Result<(), String> {
    let path = sessions_path(&app)?;
    let json = serde_json::to_string(&sessions).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Oturumlar kaydedilemedi: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[tauri::command]
pub fn session_load(app: tauri::AppHandle) -> Result<Vec<SerializedSession>, String> {
    let path = sessions_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("Oturumlar okunamadı: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Oturumlar ayrıştırılamadı: {e}"))
}

#[tauri::command]
pub fn umayterm_exit(app: tauri::AppHandle) {
    app.exit(0);
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: Option<i64>,
    pub name: String,
    pub command: String,
    pub created_at: Option<String>,
}

#[tauri::command]
pub fn snippet_list(state: State<'_, Store>) -> Result<Vec<Snippet>, String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, command, created_at FROM snippets ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Snippet {
                id: row.get(0)?,
                name: row.get(1)?,
                command: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn snippet_save(state: State<'_, Store>, snippet: Snippet) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    match snippet.id {
        Some(id) => {
            conn.execute(
                "UPDATE snippets SET name=?1, command=?2 WHERE id=?3",
                params![snippet.name, snippet.command, id],
            )
            .map_err(|e| e.to_string())?;
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO snippets (name, command) VALUES (?1, ?2)",
                params![snippet.name, snippet.command],
            )
            .map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    }
}

#[tauri::command]
pub fn snippet_delete(state: State<'_, Store>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Veritabanı kilidi zehirlendi".to_string())?;
    conn.execute("DELETE FROM snippets WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}