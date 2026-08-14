use std::io::Write;
use std::sync::Arc;

use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use serde::Serialize;
use tauri::{Emitter, State};
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;

use crate::ssh::SshManager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    name: String,
    path: String,
    is_dir: bool,
    is_symlink: bool,
    size: Option<u64>,
    mtime: Option<u32>,
}

pub async fn get_sftp(
    manager: &SshManager,
    session_id: u32,
) -> Result<SftpSession, String> {
    let ssh = manager
        .sessions
        .lock()
        .unwrap()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| format!("Oturum bulunamadı: {session_id}"))?;
    let channel = ssh
        .handle
        .channel_open_session()
        .await
        .map_err(|e| format!("SFTP kanalı açılamadı: {e}"))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| format!("SFTP isteği başarısız: {e}"))?;
    let stream = channel.into_stream();
    SftpSession::new(stream)
        .await
        .map_err(|e| format!("SFTP oturumu başlatılamadı: {e}"))
}

#[tauri::command]
pub async fn sftp_list(
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    path: String,
) -> Result<Vec<SftpEntry>, String> {
    let sftp = get_sftp(&state, session_id).await?;
    let mut files: Vec<SftpEntry> = sftp
        .read_dir(&path)
        .await
        .map_err(|e| format!("Dizin okunamadı: {e}"))?
        .map(|entry| {
            let meta = entry.metadata();
            SftpEntry {
                name: entry.file_name(),
                path: entry.path(),
                is_dir: meta.is_dir(),
                is_symlink: meta.is_symlink(),
                size: meta.size,
                mtime: meta.mtime,
            }
        })
        .collect();
    files.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(files)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SftpProgress {
    pub op_id: u32,
    pub transferred: u64,
    pub total: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SftpDone {
    pub op_id: u32,
    pub ok: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn sftp_download(
    app: tauri::AppHandle,
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    remote: String,
    local: String,
    op_id: u32,
) -> Result<(), String> {
    let sftp = get_sftp(&state, session_id).await?;
    let total = sftp
        .metadata(&remote)
        .await
        .map_err(|e| format!("Dosya bilgisi alınamadı: {e}"))?
        .size
        .unwrap_or(0);
    let mut file = sftp
        .open(&remote)
        .await
        .map_err(|e| format!("Dosya açılamadı: {e}"))?;
    let mut out = std::fs::File::create(&local)
        .map_err(|e| format!("Yerel dosya oluşturulamadı: {e}"))?;
    let mut transferred = 0u64;
    let mut buf = vec![0u8; 65536];
    let result = loop {
        let n = file
            .read(&mut buf)
            .await
            .map_err(|e| format!("Okuma hatası: {e}"))?;
        if n == 0 {
            break Ok(());
        }
        if let Err(e) = out.write_all(&buf[..n]) {
            break Err(format!("Yazma hatası: {e}"));
        }
        transferred += n as u64;
        if transferred % (65536 * 16) == 0 {
            let _ = app.emit(
                "sftp-progress",
                SftpProgress {
                    op_id,
                    transferred,
                    total,
                },
            );
        }
    };
    match result {
        Ok(()) => {
            let _ = app.emit(
                "sftp-progress",
                SftpProgress {
                    op_id,
                    transferred,
                    total,
                },
            );
            let _ = app.emit("sftp-done", SftpDone { op_id, ok: true, error: None });
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(
                "sftp-done",
                SftpDone {
                    op_id,
                    ok: false,
                    error: Some(e.clone()),
                },
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn sftp_upload(
    app: tauri::AppHandle,
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    local: String,
    remote: String,
    op_id: u32,
) -> Result<(), String> {
    let sftp = get_sftp(&state, session_id).await?;
    let total = std::fs::metadata(&local)
        .map_err(|e| format!("Yerel dosya bilgisi alınamadı: {e}"))?
        .len();
    let mut file = sftp
        .open_with_flags(&remote, OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE)
        .await
        .map_err(|e| format!("Dosya açılamadı: {e}"))?;
    let mut data = std::fs::File::open(&local)
        .map_err(|e| format!("Yerel dosya okunamadı: {e}"))?;
    let mut transferred = 0u64;
    let mut buf = vec![0u8; 65536];
    let result = loop {
        let n = std::io::Read::read(&mut data, &mut buf)
            .map_err(|e| format!("Okuma hatası: {e}"))?;
        if n == 0 {
            break Ok(());
        }
        if let Err(e) = file.write_all(&buf[..n]).await {
            break Err(format!("Yazma hatası: {e}"));
        }
        transferred += n as u64;
        if transferred % (65536 * 16) == 0 {
            let _ = app.emit(
                "sftp-progress",
                SftpProgress {
                    op_id,
                    transferred,
                    total,
                },
            );
        }
    };
    match result {
        Ok(()) => {
            let _ = app.emit(
                "sftp-progress",
                SftpProgress {
                    op_id,
                    transferred,
                    total,
                },
            );
            let _ = app.emit("sftp-done", SftpDone { op_id, ok: true, error: None });
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(
                "sftp-done",
                SftpDone {
                    op_id,
                    ok: false,
                    error: Some(e.clone()),
                },
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn sftp_mkdir(
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    path: String,
) -> Result<(), String> {
    let sftp = get_sftp(&state, session_id).await?;
    sftp.create_dir(&path)
        .await
        .map_err(|e| format!("Dizin oluşturulamadı: {e}"))
}

#[tauri::command]
pub async fn sftp_remove(
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    path: String,
) -> Result<(), String> {
    let sftp = get_sftp(&state, session_id).await?;
    sftp.remove_file(&path)
        .await
        .map_err(|e| format!("Dosya silinemedi: {e}"))
}

#[tauri::command]
pub async fn sftp_rmdir(
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    path: String,
) -> Result<(), String> {
    let sftp = get_sftp(&state, session_id).await?;
    sftp.remove_dir(&path)
        .await
        .map_err(|e| format!("Dizin silinemedi: {e}"))
}

#[tauri::command]
pub async fn sftp_rename(
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    from: String,
    to: String,
) -> Result<(), String> {
    let sftp = get_sftp(&state, session_id).await?;
    sftp.rename(&from, &to)
        .await
        .map_err(|e| format!("Yeniden adlandırılamadı: {e}"))
}

#[tauri::command]
pub async fn sftp_mkfile(
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    path: String,
) -> Result<(), String> {
    let sftp = get_sftp(&state, session_id).await?;
    sftp.open_with_flags(&path, OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE)
        .await
        .map_err(|e| format!("Dosya oluşturulamadı: {e}"))?
        .close()
        .await
        .map_err(|e| format!("Dosya kapatılamadı: {e}"))
}

const MAX_BYTE_TRANSFER: usize = 8 * 1024 * 1024;

fn decode_b64(data_b64: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(data_b64)
        .map_err(|e| format!("Veri çözülemedi: {e}"))
}

fn encode_b64(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}

#[tauri::command]
pub async fn sftp_read_bytes(
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    remote: String,
) -> Result<String, String> {
    let sftp = get_sftp(&state, session_id).await?;
    let mut file = sftp
        .open(&remote)
        .await
        .map_err(|e| format!("Dosya açılamadı: {e}"))?;
    let mut buf = Vec::new();
    file.take(MAX_BYTE_TRANSFER as u64 + 1)
        .read_to_end(&mut buf)
        .await
        .map_err(|e| format!("Okuma hatası: {e}"))?;
    if buf.len() > MAX_BYTE_TRANSFER {
        return Err(format!(
            "Dosya {} MB sınırını aşıyor. İndirme işlemini kullanın.",
            MAX_BYTE_TRANSFER / 1024 / 1024
        ));
    }
    Ok(encode_b64(&buf))
}

#[tauri::command]
pub async fn sftp_write_bytes(
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    remote: String,
    data_b64: String,
) -> Result<u64, String> {
    let data = decode_b64(&data_b64)?;
    if data.len() > MAX_BYTE_TRANSFER {
        return Err(format!(
            "Veri {} MB sınırını aşıyor. Yükleme işlemini kullanın.",
            MAX_BYTE_TRANSFER / 1024 / 1024
        ));
    }
    let sftp = get_sftp(&state, session_id).await?;
    let mut file = sftp
        .open_with_flags(&remote, OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE)
        .await
        .map_err(|e| format!("Dosya açılamadı: {e}"))?;
    file.write_all(&data)
        .await
        .map_err(|e| format!("Yazma hatası: {e}"))?;
    Ok(data.len() as u64)
}