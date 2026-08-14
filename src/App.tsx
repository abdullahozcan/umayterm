import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSessionStore, applyThemeBackend } from "./store";
import TerminalView from "./components/TerminalView";
import ConnectModal from "./components/ConnectModal";
import HostKeyModal from "./components/HostKeyModal";
import SnippetModal from "./components/SnippetModal";
import SettingsDrawer from "./components/SettingsDrawer";
import PaletteModal from "./components/PaletteModal";
import SftpPanel from "./components/SftpPanel";
import TunnelModal from "./components/TunnelModal";
import Sidebar from "./components/Sidebar";
import LockScreen from "./components/LockScreen";
import type { Session } from "./types";
import "./styles/app.css";

const TAB_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316"];

function useShortcuts() {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const isTypingTarget = (el: Element | null) =>
      !!el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        (el as HTMLElement).isContentEditable);

    const switchTab = (dir: number) => {
      const st = useSessionStore.getState();
      const sessions = st.sessions;
      if (sessions.length === 0) return;
      const i = Math.max(
        0,
        sessions.findIndex((s) => s.id === st.activeId),
      );
      st.activate(sessions[(i + dir + sessions.length) % sessions.length].id);
    };

    const onKey = (e: KeyboardEvent) => {
      const st = useSessionStore.getState();
      if (st.locked) return;
      const el = document.activeElement as HTMLElement | null;
      const terminalFocused = !!el?.closest?.(".xterm");
      const typing = isTypingTarget(el);
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (mod && (k === "=" || k === "+" || k === "-" || k === "0")) {
        e.preventDefault();
        if (k === "0") st.setFontSize(13);
        else st.zoomFont(k === "=" || k === "+" ? 1 : -1);
        return;
      }
      if (!mod || typing) return;

      if (terminalFocused) {
        if (k === "tab" || /^[1-9]$/.test(k)) {
          e.preventDefault();
          if (k === "tab") switchTab(e.shiftKey ? -1 : 1);
          else if (Number(k) <= st.sessions.length) {
            st.activate(st.sessions[Number(k) - 1].id);
          }
        }
        return;
      }

      if (k === "t") {
        e.preventDefault();
        st.openLocal();
      } else if (k === "p") {
        e.preventDefault();
        st.setPaletteOpen(!st.paletteOpen);
      } else if (k === "w") {
        e.preventDefault();
        if (st.activeId != null) st.close(st.activeId);
      } else if (k === "tab") {
        e.preventDefault();
        switchTab(e.shiftKey ? -1 : 1);
      } else if (/^[1-9]$/.test(k) && Number(k) <= st.sessions.length) {
        e.preventDefault();
        st.activate(st.sessions[Number(k) - 1].id);
      } else if (k === "f11") {
        e.preventDefault();
        getCurrentWindow().setFullscreen(!fullscreen);
        setFullscreen(!fullscreen);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function App() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const visibleIds = useSessionStore((s) => s.visibleIds);
  const splitDir = useSessionStore((s) => s.splitDir);
  const themeId = useSessionStore((s) => s.themeId);
  const openLocal = useSessionStore((s) => s.openLocal);
  const activate = useSessionStore((s) => s.activate);
  const focusSession = useSessionStore((s) => s.focusSession);
  const close = useSessionStore((s) => s.close);
  const duplicateTab = useSessionStore((s) => s.duplicateTab);
  const setConnectOpen = useSessionStore((s) => s.setConnectOpen);
  const connectOpen = useSessionStore((s) => s.connectOpen);
  const splitSession = useSessionStore((s) => s.splitSession);
  const connectingIds = useSessionStore((s) => s.connectingIds);
  const setSettingsOpen = useSessionStore((s) => s.setSettingsOpen);
  const renameSession = useSessionStore((s) => s.renameSession);
  const setSessionColor = useSessionStore((s) => s.setSessionColor);
  const moveSession = useSessionStore((s) => s.moveSession);
  const sftpOpen = useSessionStore((s) => s.sftpOpen);
  const setSftpOpen = useSessionStore((s) => s.setSftpOpen);
  const setTunnelsOpen = useSessionStore((s) => s.setTunnelsOpen);
  const locked = useSessionStore((s) => s.locked);
  const lockEnabled = useSessionStore((s) => s.lockEnabled);
  const setLocked = useSessionStore((s) => s.setLocked);
  const broadcastOpen = useSessionStore((s) => s.broadcastOpen);
  const setBroadcastOpen = useSessionStore((s) => s.setBroadcastOpen);
  const broadcastSend = useSessionStore((s) => s.broadcastSend);
  const deadIds = useSessionStore((s) => s.deadIds);
  const updateAvailable = useSessionStore((s) => s.updateAvailable);
  const downloadAndInstall = useSessionStore((s) => s.downloadAndInstall);
  const toast = useSessionStore((s) => s.toast);
  const clearToast = useSessionStore((s) => s.clearToast);
  const [broadcastText, setBroadcastText] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [tabMenu, setTabMenu] = useState<{ id: number; x: number; y: number } | null>(
    null,
  );
  const [dragId, setDragId] = useState<number | null>(null);

  useEffect(() => {
    if (!tabMenu) return;
    const close = () => setTabMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [tabMenu]);

  const commitRename = (s: Session) => {
    renameSession(s.id, editTitle);
    setEditingId(null);
  };

  useEffect(() => {
    applyThemeBackend(themeId);
    const unlockBoot = async () => {
      const st = useSessionStore.getState();
      await st.loadHosts();
      if (st.sessions.length === 0) {
        const restored = await st.restoreSessions();
        if (restored === 0) {
          st.openLocal();
        }
      }
    };
    const boot = async () => {
      const st = useSessionStore.getState();
      await st.loadSettings();
      const enabled = await st.checkLockStatus();
      if (enabled) {
        st.setLocked(true);
      } else {
        await unlockBoot();
      }
      void st.checkForUpdates();
      const win = getCurrentWindow();
      let closing = false;
      void win.onCloseRequested(async (event) => {
        if (closing) return;
        closing = true;
        event.preventDefault();
        await useSessionStore.getState().saveSessions();
        await invoke("umayterm_exit");
      });
    };
    void boot();
    const unsub = useSessionStore.subscribe((state, prev) => {
      if (prev.locked && !state.locked) {
        void unlockBoot();
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useShortcuts();

  const visible = sessions.filter((s) => visibleIds.includes(s.id));
  const count = visible.length;

  let gridRows = "1fr";
  let gridCols = "1fr";
  let gridAreas = '"a"';
  const slotAreas = ["a", "b", "c", "d"];
  if (count === 2) {
    if (splitDir === "row") {
      gridCols = "1fr 1fr";
      gridAreas = '"a b"';
    } else {
      gridRows = "1fr 1fr";
      gridAreas = '"a" "b"';
    }
  } else if (count === 3) {
    gridRows = "1fr 1fr";
    gridCols = "1fr 1fr";
    gridAreas = splitDir === "row" ? '"a a" "b c"' : '"a b" "a c"';
  } else if (count >= 4) {
    gridRows = "1fr 1fr";
    gridCols = "1fr 1fr";
    gridAreas = '"a b" "c d"';
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="tabbar">
          <button className="tab-connect" onClick={() => setConnectOpen(true)}>
            <span className="tab-connect-icon">🔌</span> SSH Bağlan
          </button>
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`tab ${s.id === activeId ? "active" : ""} ${
                dragId === s.id ? "dragging" : ""
              }`}
              onClick={() => activate(s.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setTabMenu({ id: s.id, x: e.clientX, y: e.clientY });
              }}
              draggable
              onDragStart={(e) => {
                setDragId(s.id);
                e.dataTransfer.setData("text/plain", String(s.id));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const fromId = Number(e.dataTransfer.getData("text/plain"));
                if (Number.isFinite(fromId)) moveSession(fromId, s.id);
                setDragId(null);
              }}
              onDragEnd={() => setDragId(null)}
            >
              <span className="tab-icon">
                {connectingIds.includes(s.id) ? (
                  <span className="tab-spinner" />
                ) : (
                  s.kind === "ssh" ? "🖥" : "▣"
                )}
              </span>
              {s.color && (
                <span className="tab-dot" style={{ background: s.color }} />
              )}
              {editingId === s.id ? (
                <input
                  className="tab-edit"
                  value={editTitle}
                  autoFocus
                  onChange={(e) => setEditTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => commitRename(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(s);
                    else if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <span
                  className="tab-title"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(s.id);
                    setEditTitle(s.title);
                  }}
                >
                  {s.title}
                </span>
              )}
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  close(s.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
          {tabMenu && (
            <div
              className="term-menu tab-menu"
              style={{ left: tabMenu.x, top: tabMenu.y }}
            >
              <div className="term-menu-label">Sekme rengi</div>
              <div className="color-row">
                {TAB_COLORS.map((c) => (
                  <button
                    key={c}
                    className="color-swatch"
                    style={{ background: c }}
                    onClick={() => {
                      setSessionColor(tabMenu.id, c);
                      setTabMenu(null);
                    }}
                  />
                ))}
                <button
                  className="color-swatch clear"
                  title="Rengi kaldır"
                  onClick={() => {
                    setSessionColor(tabMenu.id, null);
                    setTabMenu(null);
                  }}
                >
                  ×
                </button>
              </div>
              <div className="term-menu-sep" />
              <button
                className="term-menu-item"
                onClick={() => {
                  const s = sessions.find((x) => x.id === tabMenu.id);
                  if (s) {
                    setEditingId(s.id);
                    setEditTitle(s.title);
                  }
                  setTabMenu(null);
                }}
              >
                Yeniden adlandır
              </button>
              <button
                className="term-menu-item"
                onClick={() => {
                  duplicateTab(tabMenu.id);
                  setTabMenu(null);
                }}
              >
                Sekmeyi kopyala
              </button>
              <button
                className="term-menu-item"
                onClick={() => {
                  close(tabMenu.id);
                  setTabMenu(null);
                }}
              >
                Sekmeyi kapat
              </button>
            </div>
          )}
          <button
            className="tab-new"
            onClick={(e) => {
              if (e.shiftKey) {
                const dir = window.prompt("Başlangıç dizini (boş = ev):");
                openLocal(null, dir?.trim() || null);
              } else {
                openLocal();
              }
            }}
            title="Yeni yerel sekme (Shift+tık: dizin seç)"
          >
            +
          </button>
          <div className="tabbar-spacer" />
          <button
            className="tab-split"
            onClick={() => splitSession("row")}
            title="Yan yana böl (yeni terminal)"
          >
            ⇄
          </button>
          <button
            className="tab-split"
            onClick={() => splitSession("column")}
            title="Alt alta böl (yeni terminal)"
          >
            ⇅
          </button>
          <button
            className="tab-split"
            onClick={() => {
              const active = sessions.find((s) => s.id === activeId);
              if (active && active.kind === "ssh") {
                setSftpOpen(!sftpOpen, active.id);
              }
            }}
            title="SFTP paneli"
          >
            📁
          </button>
          <button
            className="tab-split"
            onClick={() => setTunnelsOpen(true)}
            title="Port yönlendirme / tünel"
          >
            🔀
          </button>
          <button
            className="tab-split"
            onClick={() => setBroadcastOpen(!broadcastOpen)}
            title="Tüm sekmelere komut gönder (broadcast)"
          >
            📢
          </button>
          <button
            className="tab-split"
            onClick={() => setLocked(true)}
            disabled={!lockEnabled}
            title="Uygulamayı kilitle"
          >
            🔒
          </button>
          <button
            className="tab-split"
            onClick={() => setSettingsOpen(true)}
            title="Ayarlar"
          >
            ⚙
          </button>
        </div>
        {updateAvailable && (
          <div className="update-banner">
            <span className="update-banner-text">
              🆕 Yeni sürüm v{updateAvailable.version} mevcut
            </span>
            <button
              className="btn-primary"
              onClick={() => void downloadAndInstall()}
            >
              İndir ve kur
            </button>
            <button
              className="broadcast-close"
              onClick={() => useSessionStore.setState({ updateAvailable: null })}
              title="Kapat"
            >
              ×
            </button>
          </div>
        )}
        {broadcastOpen && (
          <div className="broadcast-bar">
            <span className="broadcast-label">
              📢{" "}
              {sessions.filter((s) => !deadIds.includes(s.id)).length} sekmeye
              gönderiliyor
            </span>
            <input
              className="broadcast-input"
              value={broadcastText}
              autoFocus
              onChange={(e) => setBroadcastText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = broadcastSend(broadcastText + "\r");
                  setBroadcastText("");
                  if (n === 0) setBroadcastOpen(false);
                } else if (e.key === "Escape") {
                  setBroadcastOpen(false);
                }
              }}
              placeholder="Komut yazın, Enter tüm sekmelere gönderir (Esc: kapat)"
            />
            <button
              className="broadcast-close"
              onClick={() => setBroadcastOpen(false)}
            >
              ×
            </button>
          </div>
        )}
        <div
          className="terminal-area"
          style={{
            gridTemplateRows: gridRows,
            gridTemplateColumns: gridCols,
            gridTemplateAreas: gridAreas,
          }}
        >
          {count === 0 && sessions.length === 0 ? (
            <div className="empty-state">Yeni bir sekme açın veya SSH bağlantısı kurun</div>
          ) : (
            sessions.map((s) => {
              const visIndex = visibleIds.indexOf(s.id);
              const isVisible = visIndex >= 0;
              return (
                <div
                  key={s.id}
                  className={`term-slot ${s.id === activeId ? "" : "inactive"}`}
                  style={{
                    gridArea: isVisible ? slotAreas[visIndex] : undefined,
                    display: isVisible ? undefined : "none",
                  }}
                  onClick={() => focusSession(s.id)}
                >
                  <TerminalView session={s} active={s.id === activeId} />
                </div>
              );
            })
          )}
        </div>
      </div>
      {connectOpen && <ConnectModal />}
      <SnippetModal />
      <HostKeyModal />
      <SettingsDrawer />
      <PaletteModal />
      {sftpOpen && <SftpPanel />}
      <TunnelModal />
      {locked && <LockScreen />}
      {toast && (
        <div className="toast">
          <span className="toast-text">{toast}</span>
          <button className="broadcast-close" onClick={clearToast}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;