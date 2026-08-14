use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use russh::keys::agent::client::AgentClient;
use russh::keys::{HashAlg, PrivateKey, PrivateKeyWithHashAlg, PublicKey};
use russh::{client, ChannelId, ChannelWriteHalf, Disconnect};
use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_BUFFER_CHUNKS: usize = 1024;
const KEEPALIVE_INTERVAL_SECS: u64 = 30;
const KEEPALIVE_MAX: usize = 3;

#[derive(Default)]
pub struct SshManager {
    pub sessions: Mutex<HashMap<u32, Arc<SshSession>>>,
    accepted_host_keys: Mutex<HashMap<u32, Vec<String>>>,
}

pub(crate) struct SshSession {
    pub(crate) handle: client::Handle<SshHandler>,
    pub(crate) channel: tokio::sync::Mutex<ChannelWriteHalf<client::Msg>>,
    pub(crate) out: Arc<Mutex<VecDeque<Vec<u8>>>>,
}

#[derive(Serialize, Clone)]
pub struct SshExit {
    pub id: u32,
    pub code: u32,
}

#[derive(Serialize, Clone)]
pub struct SshClose {
    pub id: u32,
}

#[derive(Serialize, Clone)]
pub struct SshError {
    pub id: u32,
    pub message: String,
}

#[derive(Serialize, Clone)]
pub struct HostKeyPrompt {
    pub id: u32,
    pub fingerprint: String,
    pub changed: bool,
}

#[derive(Deserialize)]
pub struct SshConnectParams {
    pub session_id: u32,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub cols: u32,
    pub rows: u32,
    pub auth: SshAuth,
}

#[derive(Deserialize)]
#[serde(tag = "method", rename_all = "lowercase")]
pub enum SshAuth {
    Password { password: String },
    Key { key_path: String, passphrase: Option<String> },
    Agent,
}

pub(crate) struct SshHandler {
    app: AppHandle,
    session_id: u32,
    host: String,
    port: u16,
    out: Arc<Mutex<VecDeque<Vec<u8>>>>,
}

impl SshHandler {
    fn remove_session(&self) {
        let Some(mgr) = self.app.try_state::<Arc<SshManager>>() else {
            return;
        };
        let guard = mgr.sessions.lock().ok();
        if let Some(mut sessions) = guard {
            if sessions.remove(&self.session_id).is_some() {
                eprintln!("[ssh] oturum temizlendi (session {})", self.session_id);
            }
        }
    }
}

impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        let fingerprint = server_public_key.fingerprint(HashAlg::Sha256).to_string();
        let mgr = self.app.state::<Arc<SshManager>>();
        let accepted = mgr
            .accepted_host_keys
            .lock()
            .map(|g| g.get(&self.session_id).cloned().unwrap_or_default())
            .unwrap_or_default();
        if accepted.iter().any(|x| x == &fingerprint) {
            return Ok(true);
        }
        let stored = self.app.try_state::<crate::store::Store>().and_then(|store| {
            store
                .conn
                .lock()
                .ok()
                .and_then(|conn| crate::store::host_key_get(&conn, &self.host, self.port))
        });
        if stored.as_deref() == Some(fingerprint.as_str()) {
            return Ok(true);
        }
        let changed = stored.is_some();
        eprintln!(
            "[ssh] host anahtarı onayı bekleniyor (session {}, değişti: {changed})",
            self.session_id
        );
        let _ = self.app.emit(
            "ssh-host-key",
            HostKeyPrompt {
                id: self.session_id,
                fingerprint,
                changed,
            },
        );
        Ok(false)
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        if data.len() > 65536 {
            eprintln!(
                "[ssh] data: {} bayt (büyük çıktı, session {})",
                data.len(),
                self.session_id
            );
        }
        if let Ok(mut q) = self.out.lock() {
            q.push_back(data.to_vec());
            while q.len() > MAX_BUFFER_CHUNKS {
                q.pop_front();
            }
        }
        Ok(())
    }

    async fn extended_data(
        &mut self,
        _channel: ChannelId,
        _ext: u32,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        if let Ok(mut q) = self.out.lock() {
            q.push_back(data.to_vec());
            while q.len() > MAX_BUFFER_CHUNKS {
                q.pop_front();
            }
        }
        Ok(())
    }

    async fn channel_close(
        &mut self,
        _channel: ChannelId,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        eprintln!("[ssh] kanal kapandı (session {})", self.session_id);
        let _ = self.app.emit("ssh-close", SshClose { id: self.session_id });
        self.remove_session();
        Ok(())
    }

    async fn exit_status(
        &mut self,
        _channel: ChannelId,
        exit_status: u32,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let _ = self.app.emit(
            "ssh-exit",
            SshExit {
                id: self.session_id,
                code: exit_status,
            },
        );
        Ok(())
    }

    async fn disconnected(
        &mut self,
        _reason: client::DisconnectReason<Self::Error>,
    ) -> Result<(), Self::Error> {
        let _ = self.app.emit("ssh-close", SshClose { id: self.session_id });
        self.remove_session();
        Ok(())
    }
}

fn load_key(path: &str, passphrase: Option<&str>) -> Result<PrivateKey, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Anahtar dosyası okunamadı ({path}): {e}"))?;
    let key = PrivateKey::from_openssh(content.as_bytes())
        .map_err(|e| format!("Anahtar ayrıştırılamadı: {e}"))?;
    if key.is_encrypted() {
        let pass = passphrase.ok_or_else(|| "Anahtar şifreli, parola gerekli".to_string())?;
        key.decrypt(pass)
            .map_err(|e| format!("Anahtar çözülemedi (parola hatalı olabilir): {e}"))
    } else {
        Ok(key)
    }
}

async fn connect_inner(
    app: AppHandle,
    params: &SshConnectParams,
) -> Result<
    (
        client::Handle<SshHandler>,
        ChannelWriteHalf<client::Msg>,
        Arc<Mutex<VecDeque<Vec<u8>>>>,
    ),
    String,
> {
    let keepalive_secs = app
        .try_state::<crate::store::Store>()
        .and_then(|store| {
            store
                .conn
                .lock()
                .ok()
                .and_then(|conn| crate::store::settings_get(&conn, "keepaliveSecs"))
        })
        .and_then(|v| v.parse().ok())
        .unwrap_or(KEEPALIVE_INTERVAL_SECS);
    let config = Arc::new(client::Config {
        channel_buffer_size: 1024,
        keepalive_interval: Some(Duration::from_secs(keepalive_secs)),
        keepalive_max: KEEPALIVE_MAX,
        ..Default::default()
    });
    let out = Arc::new(Mutex::new(VecDeque::new()));
    let handler = SshHandler {
        app,
        session_id: params.session_id,
        host: params.host.clone(),
        port: params.port,
        out: out.clone(),
    };
    let mut session = client::connect(config, (params.host.as_str(), params.port), handler)
        .await
        .map_err(|e| format!("Bağlantı kurulamadı: {e}"))?;

    let auth_result = match &params.auth {
        SshAuth::Password { password } => session
            .authenticate_password(&params.username, password)
            .await
            .map_err(|e| format!("Kimlik doğrulama hatası: {e}"))?,
        SshAuth::Key {
            key_path,
            passphrase,
        } => {
            let key = load_key(key_path, passphrase.as_deref())?;
let hash = if matches!(key.algorithm(), russh::keys::Algorithm::Rsa { .. }) {
                session
                    .best_supported_rsa_hash()
                    .await
                    .map_err(|e| format!("RSA karması: {e}"))?
                    .flatten()
            } else {
                None
            };
            session
                .authenticate_publickey(
                    &params.username,
                    PrivateKeyWithHashAlg::new(Arc::new(key), hash),
                )
                .await
                .map_err(|e| format!("Kimlik doğrulama hatası: {e}"))?
        }
        SshAuth::Agent => {
            let mut agent = AgentClient::connect_env()
                .await
                .map_err(|e| format!("ssh-agent bulunamadı (SSH_AUTH_SOCK): {e}"))?;
            let identities = agent
                .request_identities()
                .await
                .map_err(|e| format!("Agent anahtar listesi alınamadı: {e}"))?;
            let mut result = None;
            for key in identities {
let hash = if matches!(key.algorithm(), russh::keys::Algorithm::Rsa { .. }) {
                    session
                        .best_supported_rsa_hash()
                        .await
                        .map_err(|e| format!("RSA karması: {e}"))?
                        .flatten()
                } else {
                    None
                };
                match session
                    .authenticate_publickey_with(&params.username, key, hash, &mut agent)
                    .await
                {
                    Ok(r) => {
                        let success = r == client::AuthResult::Success;
                        result = Some(r);
                        if success {
                            break;
                        }
                    }
                    Err(_) => continue,
                }
            }
            result.ok_or_else(|| "Kimlik doğrulama hatası".to_string())?
        }
    };

    if auth_result != client::AuthResult::Success {
        return Err("Kimlik doğrulaması başarısız (parola/anahtar hatalı olabilir)".to_string());
    }

    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| format!("Kanal açılamadı: {e}"))?;
    channel
        .request_pty(true, "xterm-256color", params.cols, params.rows, 0, 0, &[])
        .await
        .map_err(|e| format!("PTY isteği başarısız: {e}"))?;
    channel
        .request_shell(true)
        .await
        .map_err(|e| format!("Shell isteği başarısız: {e}"))?;

    let (mut read_half, write_half) = channel.split();
    tokio::spawn(async move {
        while read_half.wait().await.is_some() {}
    });
    Ok((session, write_half, out))
}

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    state: State<'_, Arc<SshManager>>,
    params: SshConnectParams,
) -> Result<(), String> {
    let session_id = params.session_id;
    let mgr = state.inner().clone();
    eprintln!(
        "[ssh] bağlanılıyor {}@{}:{} (session {})",
        params.username, params.host, params.port, session_id
    );
    tauri::async_runtime::spawn(async move {
        match tokio::time::timeout(
            std::time::Duration::from_secs(20),
            connect_inner(app.clone(), &params),
        )
        .await
        {
            Ok(Ok((handle, channel, out))) => {
                eprintln!("[ssh] bağlandı (session {session_id})");
                if let Ok(mut g) = mgr.sessions.lock() {
                    g.insert(
                        session_id,
                        Arc::new(SshSession {
                            handle,
                            channel: tokio::sync::Mutex::new(channel),
                            out,
                        }),
                    );
                } else {
                    eprintln!("[ssh] UYARI: sessions kilitlenemedi (session {session_id})");
                }
                let _ = app.emit("ssh-connected", SshClose { id: session_id });
            }
            Ok(Err(message)) => {
                eprintln!("[ssh] hata: {message} (session {session_id})");
                let _ = app.emit("ssh-error", SshError { id: session_id, message });
            }
            Err(_) => {
                eprintln!("[ssh] zaman aşımı (session {session_id})");
                let _ = app.emit(
                    "ssh-error",
                    SshError {
                        id: session_id,
                        message: "Bağlantı zaman aşımı: sunucu yanıt vermedi".to_string(),
                    },
                );
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn ssh_poll(state: State<'_, Arc<SshManager>>, id: u32) -> Result<Response, String> {
    let mut total = Vec::new();
    let session = state
        .sessions
        .lock()
        .map(|g| g.get(&id).cloned())
        .unwrap_or(None);
    if let Some(session) = session {
        if let Ok(mut q) = session.out.lock() {
            while let Some(chunk) = q.pop_front() {
                total.extend_from_slice(&chunk);
                if total.len() >= 65536 {
                    break;
                }
            }
        }
    }
    Ok(Response::new(total))
}

#[tauri::command]
pub async fn ssh_write(
    state: State<'_, Arc<SshManager>>,
    id: u32,
    data: Vec<u8>,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|_| "Oturum kayıtları kilitli".to_string())?
        .get(&id)
        .cloned()
        .ok_or_else(|| "SSH oturumu bulunamadı".to_string())?;
    let channel = session.channel.lock().await;
    channel
        .data(&data[..])
        .await
        .map_err(|e| format!("Veri gönderilemedi: {e}"))
}

#[tauri::command]
pub async fn ssh_resize(
    state: State<'_, Arc<SshManager>>,
    id: u32,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|_| "Oturum kayıtları kilitli".to_string())?
        .get(&id)
        .cloned()
        .ok_or_else(|| "SSH oturumu bulunamadı".to_string())?;
    let channel = session.channel.lock().await;
    channel
        .window_change(cols, rows, 0, 0)
        .await
        .map_err(|e| format!("Pencere boyutu gönderilemedi: {e}"))
}

#[tauri::command]
pub async fn ssh_close(
    state: State<'_, Arc<SshManager>>,
    id: u32,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|_| "Oturum kayıtları kilitli".to_string())?
        .remove(&id);
    if let Some(session) = session {
        let channel = session.channel.lock().await;
        let _ = tokio::time::timeout(Duration::from_secs(3), channel.eof()).await;
        let _ = tokio::time::timeout(Duration::from_secs(3), channel.close()).await;
        let _ = tokio::time::timeout(
            Duration::from_secs(3),
            session.handle.disconnect(Disconnect::ByApplication, "", ""),
        )
        .await;
    }
    Ok(())
}

#[tauri::command]
pub fn ssh_accept_host_key(
    state: State<'_, Arc<SshManager>>,
    store: State<'_, crate::store::Store>,
    session_id: u32,
    fingerprint: String,
    host: String,
    port: u16,
) {
    if let Ok(mut accepted) = state.accepted_host_keys.lock() {
        accepted.entry(session_id).or_default().push(fingerprint.clone());
    }
    if let Ok(conn) = store.conn.lock() {
        if let Err(e) = crate::store::host_key_save(&conn, &host, port, &fingerprint) {
            eprintln!("[ssh] host anahtarı kaydedilemedi: {e}");
        }
    }
}

#[tauri::command]
pub fn ssh_reject_host_key(state: State<'_, Arc<SshManager>>, session_id: u32) {
    if let Ok(mut accepted) = state.accepted_host_keys.lock() {
        accepted.remove(&session_id);
    }
}

pub(crate) async fn apply_ls_colors(
    state: &Arc<SshManager>,
    id: u32,
    cmd: &str,
) {
    let session = {
        let Ok(guard) = state.sessions.lock() else {
            return;
        };
        guard.get(&id).cloned()
    };
    if let Some(session) = session {
        let channel = session.channel.lock().await;
        let _ = channel.data(cmd.as_bytes()).await;
    }
}