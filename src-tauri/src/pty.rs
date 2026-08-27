use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::ssh::SshManager;

const MAX_BUFFER_CHUNKS: usize = 256;

#[derive(Deserialize, Clone)]
pub struct PtyTheme {
    pub prompt_user: String,
    pub prompt_dir: String,
    pub prompt_symbol: String,
    pub ls_colors: String,
}

fn default_theme() -> PtyTheme {
    PtyTheme {
        prompt_user: "#61afef".to_string(),
        prompt_dir: "#98c379".to_string(),
        prompt_symbol: "#e5c07b".to_string(),
        ls_colors: "di=38;2;97;175;239:ln=38;2;86;182;194:ex=38;2;152;195;121:or=38;2;224;108;117:pi=38;2;224;108;117:so=38;2;224;108;117:bd=38;2;224;108;117:cd=38;2;224;108;117:*.tar=38;2;224;108;117:*.tgz=38;2;224;108;117:*.gz=38;2;224;108;117:*.zip=38;2;224;108;117:*.xz=38;2;224;108;117:*.7z=38;2;224;108;117:*.rar=38;2;224;108;117:*.png=38;2;198;120;221:*.jpg=38;2;198;120;221:*.jpeg=38;2;198;120;221:*.gif=38;2;198;120;221:*.svg=38;2;198;120;221:*.mp3=38;2;198;120;221:*.mp4=38;2;198;120;221:*.pdf=38;2;224;108;117:*.sh=38;2;152;195;121:*.rs=38;2;152;195;121:*.py=38;2;152;195;121:*.js=38;2;152;195;121:*.ts=38;2;152;195;121:*.html=38;2;224;108;117:*.css=38;2;224;108;117:*.md=38;2;97;175;239:*.txt=38;2;171;178;191:*.json=38;2;171;178;191:*.yml=38;2;171;178;191:*.log=38;2;171;178;191:*.db=38;2;86;182;194:*.lock=38;2;224;108;117:*.o=38;2;224;108;117".to_string(),
    }
}

fn zdotdir_for(app: &AppHandle, id: u32) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Veri dizini alınamadı: {e}"))?
        .join("zdotdir")
        .join(id.to_string());
    std::fs::create_dir_all(&base).map_err(|e| format!("Dizin oluşturulamadı: {e}"))?;
    Ok(base)
}

fn sanitize_ls_colors(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '=' || *c == ';' || *c == ':' || *c == '.' || *c == '_')
        .collect()
}

fn sanitize_shell_arg(input: &str) -> String {
    input
        .chars()
        .filter(|c| !matches!(c, '\'' | '"' | '`' | '$' | '\\' | '\n' | '\r' | ';'))
        .collect()
}

fn write_zshrc(zdotdir: &Path, theme: &PtyTheme) -> std::io::Result<()> {
    let safe_user = sanitize_shell_arg(&theme.prompt_user);
    let safe_symbol = sanitize_shell_arg(&theme.prompt_symbol);
    let safe_dir = sanitize_shell_arg(&theme.prompt_dir);
    let content = format!(
        "[ -r \"$HOME/.zshrc\" ] && source \"$HOME/.zshrc\"\nstty erase '^?'\nPROMPT='%F{{{user}}}%n%F{{{symbol}}}@%F{{{user}}}%m%f %F{{{dir}}}%~%f %F{{{symbol}}}❯%f '\n",
        user = safe_user,
        symbol = safe_symbol,
        dir = safe_dir,
    );
    std::fs::write(zdotdir.join(".zshrc"), content)
}

pub struct PtySession {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send>>>,
    out: Arc<Mutex<VecDeque<Vec<u8>>>>,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<u32, Arc<PtySession>>>,
    theme: Mutex<Option<PtyTheme>>,
}

impl PtyManager {
    pub fn get(&self, id: u32) -> Option<Arc<PtySession>> {
        self.sessions.lock().ok()?.get(&id).cloned()
    }
}

#[derive(Serialize, Clone)]
pub struct PtyExit {
    pub id: u32,
}

#[tauri::command]
pub fn open_pty(
    app: AppHandle,
    state: State<'_, PtyManager>,
    session_id: u32,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<(), String> {
    if state.sessions.lock().map_err(|_| "Oturum kilidi zehirlendi".to_string())?.contains_key(&session_id) {
        return Ok(());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("PTY açılamadı: {e}"))?;

    let mut cmd = CommandBuilder::new("zsh");
    if let Some(cwd) = cwd {
        cmd.cwd(cwd);
    }

    let theme = state
        .theme
        .lock()
        .ok()
        .and_then(|t| t.clone())
        .unwrap_or_else(default_theme);
    if let Ok(zdotdir) = zdotdir_for(&app, session_id) {
        let _ = write_zshrc(&zdotdir, &theme);
        cmd.env("ZDOTDIR", &zdotdir);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("CLICOLOR", "1");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LS_COLORS", &theme.ls_colors);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("zsh başlatılamadı: {e}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("okuyucu alınamadı: {e}"))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("PTY yazıcı alınamadı: {e}"))?;

    let id = session_id;
    let out = Arc::new(Mutex::new(VecDeque::new()));
    let session = Arc::new(PtySession {
        master: Arc::new(Mutex::new(pair.master)),
        writer: Arc::new(Mutex::new(writer)),
        child: Arc::new(Mutex::new(child)),
        out: out.clone(),
    });
    state.sessions.lock().map_err(|_| "Oturum kilidi zehirlendi".to_string())?.insert(id, session);

    let app2 = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 16384];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if let Ok(mut q) = out.lock() {
                        q.push_back(buf[..n].to_vec());
                        while q.len() > MAX_BUFFER_CHUNKS {
                            q.pop_front();
                        }
                    }
                }
            }
        }
        let _ = app2.emit("pty-exit", PtyExit { id });
    });

    Ok(())
}

#[tauri::command]
pub async fn pty_poll(state: State<'_, PtyManager>, id: u32) -> Result<Response, String> {
    let mut total = Vec::new();
    if let Some(session) = state.get(id) {
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
pub fn write_to_pty(
    state: State<'_, PtyManager>,
    id: u32,
    data: Vec<u8>,
) -> Result<(), String> {
    let session = state
        .get(id)
        .ok_or_else(|| "Oturum bulunamadı".to_string())?;
    let mut writer = session
        .writer
        .lock()
        .map_err(|_| "PTY yazıcı kilitli".to_string())?;
    writer.write_all(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_pty(
    state: State<'_, PtyManager>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state
        .get(id)
        .ok_or_else(|| "Oturum bulunamadı".to_string())?;
    let master = session
        .master
        .lock()
        .map_err(|_| "PTY master kilitli".to_string())?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_pty(state: State<'_, PtyManager>, id: u32) -> Result<(), String> {
    if let Ok(mut sessions) = state.sessions.lock() {
        if let Some(session) = sessions.remove(&id) {
            if let Ok(mut child) = session.child.lock() {
                let _ = child.kill();
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn apply_theme(
    app: AppHandle,
    state: State<'_, PtyManager>,
    ssh_state: State<'_, Arc<SshManager>>,
    theme: PtyTheme,
) -> Result<(), String> {
    if let Ok(mut t) = state.theme.lock() {
        *t = Some(theme.clone());
    }

    {
        let sessions = state
            .sessions
            .lock()
            .map_err(|_| "Oturumlar kilitli".to_string())?;
        let safe_ls_colors = sanitize_ls_colors(&theme.ls_colors);
        for (id, session) in sessions.iter() {
            if let Ok(zdotdir) = zdotdir_for(&app, *id) {
                let _ = write_zshrc(&zdotdir, &theme);
                let safe_zshrc = sanitize_shell_arg(&zdotdir.join(".zshrc").display().to_string());
                let cmd = format!(
                    "export LS_COLORS='{}' && source '{}'",
                    safe_ls_colors,
                    safe_zshrc
                );
                if let Ok(mut w) = session.writer.lock() {
                    let _ = w.write_all(format!("\r{}\r", cmd).as_bytes());
                }
            }
        }
    }

    {
        let ids: Vec<u32> = if let Ok(guard) = ssh_state.sessions.lock() {
            guard.keys().copied().collect()
        } else {
            Vec::new()
        };
        let safe_ls_colors = sanitize_ls_colors(&theme.ls_colors);
        let cmd = format!("export LS_COLORS='{}'\r", safe_ls_colors);
        for id in ids {
            crate::ssh::apply_ls_colors(&ssh_state, id, &cmd).await;
        }
    }

    Ok(())
}
