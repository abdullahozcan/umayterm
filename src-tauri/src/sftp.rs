use std::io::Write;
use std::sync::Arc;

use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use serde::Serialize;
use tauri::State;
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

#[tauri::command]
pub async fn sftp_download(
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    remote: String,
    local: String,
) -> Result<u64, String> {
    let sftp = get_sftp(&state, session_id).await?;
    let mut file = sftp
        .open(&remote)
        .await
        .map_err(|e| format!("Dosya açılamadı: {e}"))?;
    let mut out = std::fs::File::create(&local)
        .map_err(|e| format!("Yerel dosya oluşturulamadı: {e}"))?;
    let mut total = 0u64;
    let mut buf = vec![0u8; 65536];
    loop {
        let n = file
            .read(&mut buf)
            .await
            .map_err(|e| format!("Okuma hatası: {e}"))?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n])
            .map_err(|e| format!("Yazma hatası: {e}"))?;
        total += n as u64;
    }
    Ok(total)
}

#[tauri::command]
pub async fn sftp_upload(
    state: State<'_, Arc<SshManager>>,
    session_id: u32,
    local: String,
    remote: String,
) -> Result<u64, String> {
    let sftp = get_sftp(&state, session_id).await?;
    let mut file = sftp
        .open_with_flags(&remote, OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE)
        .await
        .map_err(|e| format!("Dosya açılamadı: {e}"))?;
    let mut data = std::fs::File::open(&local)
        .map_err(|e| format!("Yerel dosya okunamadı: {e}"))?;
    let mut total = 0u64;
    let mut buf = vec![0u8; 65536];
    loop {
        let n = std::io::Read::read(&mut data, &mut buf)
            .map_err(|e| format!("Okuma hatası: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .await
            .map_err(|e| format!("Yazma hatası: {e}"))?;
        total += n as u64;
    }
    Ok(total)
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
    file.read_to_end(&mut buf)
        .await
        .map_err(|e| format!("Okuma hatası: {e}"))?;
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