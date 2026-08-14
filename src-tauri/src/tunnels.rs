use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use russh::client::Msg;
use russh::Channel;
use serde::Serialize;
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;

use crate::ssh::SshManager;
use crate::ssh::SshSession;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TunnelInfo {
    pub id: u32,
    pub kind: String,
    pub listen_port: u16,
    pub target_host: String,
    pub target_port: u16,
    pub active: bool,
}

#[derive(Default)]
pub struct TunnelManager {
    tunnels: Mutex<HashMap<u32, TunnelRecord>>,
    next_id: AtomicU32,
}

struct TunnelRecord {
    info: Arc<TunnelInfo>,
    session_id: u32,
    handle: JoinHandle<()>,
    stopped: Arc<AtomicBool>,
}

async fn open_channel(
    ssh: &SshSession,
    host: String,
    port: u32,
) -> Result<Channel<Msg>, String> {
    ssh.handle
        .channel_open_direct_tcpip(host, port, "127.0.0.1", 0)
        .await
        .map_err(|e| format!("SSH kanalı açılamadı: {e}"))
}

async fn socks5_connect(sock: &mut TcpStream) -> Option<(String, u32)> {
    let mut buf = [0u8; 262];
    let n = sock.read(&mut buf).await.ok()?;
    if n < 2 || buf[0] != 5 {
        return None;
    }
    sock.write_all(&[5, 0]).await.ok()?;
    let n = sock.read(&mut buf).await.ok()?;
    if n < 7 || buf[0] != 5 || buf[1] != 1 {
        return None;
    }
    let (host, port) = match buf[3] {
        1 => {
            if n < 10 {
                return None;
            }
            (
                format!("{}.{}.{}.{}", buf[4], buf[5], buf[6], buf[7]),
                u16::from_be_bytes([buf[8], buf[9]]).into(),
            )
        }
        3 => {
            let len = buf[4] as usize;
            if n < 5 + len + 2 {
                return None;
            }
            (
                String::from_utf8_lossy(&buf[5..5 + len]).to_string(),
                u16::from_be_bytes([buf[5 + len], buf[6 + len]]).into(),
            )
        }
        4 => {
            if n < 22 {
                return None;
            }
            let mut s = String::from("ipv6:");
            for i in 4..20 {
                s.push_str(&format!("{:02x}{}", buf[i], if i % 2 == 1 && i < 19 { ":" } else { "" }));
            }
            (s, u16::from_be_bytes([buf[20], buf[21]]).into())
        }
        _ => return None,
    };
    sock.write_all(&[5, 0, 0, 1, 0, 0, 0, 0, 0, 0]).await.ok()?;
    Some((host, port))
}

async fn serve_client(
    mut sock: TcpStream,
    ssh: Arc<SshSession>,
    kind: String,
    target_host: String,
    target_port: u32,
) {
    let (host, port) = if kind == "socks5" {
        match socks5_connect(&mut sock).await {
            Some(x) => x,
            None => return,
        }
    } else {
        (target_host, target_port)
    };
    let channel = match open_channel(&ssh, host, port).await {
        Ok(c) => c,
        Err(_) => {
            let _ = sock
                .write_all(b"UmayTerm: SSH channel could not be opened\r\n")
                .await;
            return;
        }
    };
    let mut stream = channel.into_stream();
    let _ = tokio::io::copy_bidirectional(&mut sock, &mut stream).await;
}

async fn serve_loop(
    listener: TcpListener,
    ssh: Arc<SshSession>,
    kind: String,
    target_host: String,
    target_port: u32,
    stopped: Arc<AtomicBool>,
) {
    loop {
        if stopped.load(Ordering::SeqCst) {
            break;
        }
        let (sock, _) = match listener.accept().await {
            Ok(x) => x,
            Err(_) => break,
        };
        let ssh = ssh.clone();
        let kind = kind.clone();
        let target_host = target_host.clone();
        tokio::spawn(async move {
            serve_client(sock, ssh, kind, target_host, target_port).await;
        });
    }
}

#[tauri::command]
pub async fn tunnel_open(
    tunnels_state: State<'_, Arc<TunnelManager>>,
    ssh_state: State<'_, Arc<SshManager>>,
    ssh_session_id: u32,
    kind: String,
    listen_port: u16,
    target_host: String,
    target_port: u16,
) -> Result<TunnelInfo, String> {
    let ssh = ssh_state
        .sessions
        .lock()
        .unwrap()
        .get(&ssh_session_id)
        .cloned()
        .ok_or_else(|| format!("SSH oturumu bulunamadı: {ssh_session_id}"))?;

    let listener = TcpListener::bind(("127.0.0.1", listen_port))
        .await
        .map_err(|e| format!("Dinleme portu açılamadı: {e}"))?;
    let actual_port = listener
        .local_addr()
        .map_err(|e| format!("Port bilgisi alınamadı: {e}"))?
        .port();

    let id = tunnels_state.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    let stopped = Arc::new(AtomicBool::new(false));
    let info = Arc::new(TunnelInfo {
        id,
        kind: kind.clone(),
        listen_port: actual_port,
        target_host: target_host.clone(),
        target_port,
        active: true,
    });

    let handle = tokio::spawn(serve_loop(
        listener,
        ssh,
        kind,
        target_host,
        target_port as u32,
        stopped.clone(),
    ));

    tunnels_state.tunnels.lock().unwrap().insert(
        id,
        TunnelRecord {
            info: info.clone(),
            session_id: ssh_session_id,
            handle,
            stopped,
        },
    );
    Ok((*info).clone())
}

pub(crate) fn close_tunnels_for_session(tunnels: &TunnelManager, session_id: u32) {
    let to_close: Vec<u32> = {
        let guard = tunnels.tunnels.lock().unwrap();
        guard
            .iter()
            .filter(|(_, t)| t.session_id == session_id)
            .map(|(id, _)| *id)
            .collect()
    };
    for id in to_close {
        if let Some(record) = tunnels.tunnels.lock().unwrap().remove(&id) {
            record.stopped.store(true, Ordering::SeqCst);
            record.handle.abort();
        }
    }
}

#[tauri::command]
pub async fn tunnel_close(
    tunnels_state: State<'_, Arc<TunnelManager>>,
    id: u32,
) -> Result<(), String> {
    let record = tunnels_state
        .tunnels
        .lock()
        .unwrap()
        .remove(&id)
        .ok_or_else(|| format!("Tünel bulunamadı: {id}"))?;
    record.stopped.store(true, Ordering::SeqCst);
    record.handle.abort();
    Ok(())
}

#[tauri::command]
pub async fn tunnel_list(
    tunnels_state: State<'_, Arc<TunnelManager>>,
) -> Result<Vec<TunnelInfo>, String> {
    let mut tunnels: Vec<TunnelInfo> = tunnels_state
        .tunnels
        .lock()
        .unwrap()
        .values()
        .map(|t| {
            let mut info = (*t.info).clone();
            info.active = !t.handle.is_finished();
            info
        })
        .collect();
    tunnels.sort_by_key(|t| t.id);
    Ok(tunnels)
}