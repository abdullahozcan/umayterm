use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
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
        "[ -r \"$HOME/.zshrc\" ] && source \"$HOME/.zshrc\"\nstty erase '^?'\nPROMPT='%F{{{user}}}%n%F{{{symbol}}}@%F{{{user}}}%m%f %F{{{dir}}}%~%f %F{{{symbol}}}❯%f '\nautoload -Uz add-zsh-hook\n_ut_cmd_start() {{ print -n \"\\e]9;9;${{PWD}}\\e\\\\\" }}\n_ut_cmd_end() {{ print -n \"\\e]9;0;${{PWD}}\\e\\\\\" }}\n_ut_cwd() {{ print -Pn \"\\e]7;file://${{PWD}}\\e\\\\\" }}\nadd-zsh-hook preexec _ut_cmd_start\nadd-zsh-hook precmd _ut_cmd_end\nadd-zsh-hook precmd _ut_cwd\n_ut_cwd\n",
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
    logs: Arc<Mutex<HashMap<u32, PathBuf>>>,
    cpu_last: Mutex<HashMap<u32, (u64, u64)>>,
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

#[derive(Serialize, Clone)]
pub struct PtyCwd {
    pub id: u32,
    pub cwd: String,
}

#[derive(Serialize, Clone)]
pub struct PtyCmdDone {
    pub id: u32,
    pub seconds: u64,
}

fn process_osc(
    buf: &mut String,
    app: &AppHandle,
    id: u32,
    cmd_start: &mut Option<std::time::Instant>,
) {
    loop {
        let Some(start) = buf.find("\x1b]") else {
            break;
        };
        let after = &buf[start + 2..];
        let terminator = if let Some(end) = after.find('\x07') {
            Some((end, end + 1))
        } else if let Some(rel) = after.find("\x1b\\") {
            Some((rel, rel + 2))
        } else {
            None
        };
        let Some((payload_end, consume)) = terminator else {
            if buf.len() > 4096 {
                buf.clear();
            }
            break;
        };
        let payload = after[..payload_end].to_string();
        handle_osc(app, id, &payload, cmd_start);
        buf.drain(..start + 2 + consume);
    }
}

fn handle_osc(
    app: &AppHandle,
    id: u32,
    payload: &str,
    cmd_start: &mut Option<std::time::Instant>,
) {
    if let Some(rest) = payload.strip_prefix("7;") {
        if let Some(after) = rest.strip_prefix("file://") {
            let path = after.splitn(2, '/').nth(1).unwrap_or("");
            if !path.is_empty() {
                let _ = app.emit(
                    "pty-cwd",
                    PtyCwd {
                        id,
                        cwd: format!("/{path}"),
                    },
                );
            }
        }
    } else if payload.starts_with("9;9;") {
        *cmd_start = Some(std::time::Instant::now());
    } else if payload.starts_with("9;0;") {
        if let Some(st) = cmd_start.take() {
            let secs = st.elapsed().as_secs();
            if secs >= 5 {
                let _ = app.emit("pty-cmd-done", PtyCmdDone { id, seconds: secs });
            }
        }
    }
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
    let logs = state.logs.clone();
    std::thread::spawn(move || {
        use std::io::Write;
        let mut esc_buf = String::new();
        let mut cmd_start: Option<std::time::Instant> = None;
        let mut buf = [0u8; 16384];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = buf[..n].to_vec();
                    if let Ok(mut q) = out.lock() {
                        q.push_back(chunk.clone());
                        while q.len() > MAX_BUFFER_CHUNKS {
                            q.pop_front();
                        }
                    }
                    esc_buf.push_str(&String::from_utf8_lossy(&chunk));
                    process_osc(&mut esc_buf, &app2, id, &mut cmd_start);
                    if let Ok(lm) = logs.lock() {
                        if let Some(path) = lm.get(&id) {
                            if let Ok(mut f) = std::fs::OpenOptions::new()
                                .create(true)
                                .append(true)
                                .open(path)
                            {
                                let _ = f.write_all(&chunk);
                            }
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
pub fn pty_log_start(
    app: AppHandle,
    state: State<'_, PtyManager>,
    id: u32,
) -> Result<String, String> {
    if !state
        .sessions
        .lock()
        .map_err(|_| "Oturum kilidi zehirlendi".to_string())?
        .contains_key(&id)
    {
        return Err("Oturum bulunamadı".to_string());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Veri dizini alınamadı: {e}"))?
        .join("session-logs");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = dir.join(format!("{id}-{ts}.log"));
    let mut lm = state
        .logs
        .lock()
        .map_err(|_| "Log kilidi zehirlendi".to_string())?;
    lm.insert(id, path.clone());
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn pty_log_stop(state: State<'_, PtyManager>, id: u32) -> Result<(), String> {
    if let Ok(mut lm) = state.logs.lock() {
        lm.remove(&id);
    }
    Ok(())
}

fn parse_meminfo(line: &str, key: &str) -> Option<u64> {
    if line.starts_with(key) {
        if let Some(val) = line.split_whitespace().nth(1) {
            return val.parse().ok();
        }
    }
    None
}

#[tauri::command]
pub fn local_stats(state: State<'_, PtyManager>, id: u32) -> Result<crate::ssh::SshStats, String> {
    if !state
        .sessions
        .lock()
        .map_err(|_| "Oturum kilidi zehirlendi".to_string())?
        .contains_key(&id)
    {
        return Err("Oturum bulunamadı".to_string());
    }
    let mut stats = crate::ssh::SshStats::default();

    if let Ok(content) = std::fs::read_to_string("/proc/stat") {
        if let Some(line) = content.lines().find(|l| l.starts_with("cpu ")) {
            let parts: Vec<u64> = line
                .split_whitespace()
                .skip(1)
                .filter_map(|p| p.parse().ok())
                .collect();
            if parts.len() >= 4 {
                let idle = parts[3] + parts.get(4).copied().unwrap_or(0);
                let total: u64 = parts.iter().sum();
                let mut last = state.cpu_last.lock().map_err(|_| "CPU kilidi zehirlendi".to_string())?;
                if let Some((pt, pi)) = last.get(&id).copied() {
                    let dt = total.saturating_sub(pt);
                    let di = idle.saturating_sub(pi);
                    if dt > 0 {
                        stats.cpu = Some(((dt - di) as f64 / dt as f64) * 100.0);
                    }
                }
                last.insert(id, (total, idle));
            }
        }
    }

    let mut mem_total = 0u64;
    let mut mem_avail = 0u64;
    if let Ok(content) = std::fs::read_to_string("/proc/meminfo") {
        for line in content.lines() {
            if let Some(v) = parse_meminfo(line, "MemTotal") {
                mem_total = v;
            }
            if let Some(v) = parse_meminfo(line, "MemAvailable") {
                mem_avail = v;
            }
        }
    }
    if mem_total > 0 {
        stats.mem_total = Some(mem_total);
        stats.mem_used = Some(mem_total.saturating_sub(mem_avail));
    }

    if let Ok(content) = std::fs::read_to_string("/proc/loadavg") {
        stats.load = content
            .split_whitespace()
            .take(3)
            .filter_map(|p| p.parse().ok())
            .collect();
    }

    if let Ok(out) = std::process::Command::new("df").args(["-kP"]).output() {
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines().skip(1) {
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() >= 6 {
                let size = cols[1].parse::<u64>().unwrap_or(0);
                let used = cols[2].parse::<u64>().unwrap_or(0);
                stats.fs.push(crate::ssh::FsStat {
                    mount: cols[5].to_string(),
                    size,
                    used,
                    pct: if size > 0 { used as f64 / size as f64 * 100.0 } else { 0.0 },
                });
            }
        }
    }

    stats.ok = true;
    Ok(stats)
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
    if let Ok(mut lm) = state.logs.lock() {
        lm.remove(&id);
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
