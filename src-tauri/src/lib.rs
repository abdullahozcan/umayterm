mod ai;
mod pty;
mod sftp;
mod ssh;
mod store;
mod tunnels;

use std::sync::Arc;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyManager::default())
        .manage(Arc::new(ssh::SshManager::default()))
        .manage(Arc::new(tunnels::TunnelManager::default()))
        .manage(Arc::new(ai::AiManager::default()))
        .setup(|app| {
            let store = store::init(&app.handle())?;
            app.manage(store);
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_title(&format!("UmayTerm {}", app.package_info().version));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            store::umayterm_exit,
            ai::ai_key_set,
            ai::ai_key_clear,
            ai::ai_key_has,
            ai::ai_models,
            ai::ai_chat,
            ai::ai_stop,
            pty::open_pty,
            pty::pty_poll,
            pty::write_to_pty,
            pty::resize_pty,
            pty::close_pty,
            pty::apply_theme,
            ssh::ssh_connect,
            ssh::ssh_poll,
            ssh::ssh_write,
            ssh::ssh_resize,
            ssh::ssh_close,
            ssh::ssh_stats,
            ssh::ssh_accept_host_key,
            ssh::ssh_reject_host_key,
            store::host_list,
            store::host_list_safe,
            store::host_get_secrets,
            store::host_save,
            store::host_delete,
            store::hosts_export,
            store::hosts_import,
            store::ssh_config_import,
            store::snippet_list,
            store::snippet_save,
            store::snippet_delete,
            store::settings_get_all,
            store::settings_set,
            store::lock_status,
            store::lock_setup,
            store::lock_verify,
            store::lock_clear,
            store::session_save,
            store::session_load,
            sftp::sftp_list,
            sftp::sftp_download,
            sftp::sftp_upload,
            sftp::sftp_mkdir,
            sftp::sftp_remove,
            sftp::sftp_rmdir,
            sftp::sftp_rename,
            sftp::sftp_mkfile,
            sftp::sftp_read_bytes,
            sftp::sftp_write_bytes,
            tunnels::tunnel_open,
            tunnels::tunnel_close,
            tunnels::tunnel_list
        ])
        .run(tauri::generate_context!())
        .expect("UmayTerm başlatılamadı");
}