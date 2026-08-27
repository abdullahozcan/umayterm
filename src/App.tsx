import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSessionStore, applyThemeBackend } from "./store";
import { setLang, t } from "./i18n";
import TerminalView from "./components/TerminalView";
import ConnectModal from "./components/ConnectModal";
import HostKeyModal from "./components/HostKeyModal";
import SnippetModal from "./components/SnippetModal";
import SettingsDrawer from "./components/SettingsDrawer";
import PaletteModal from "./components/PaletteModal";
import SftpPanel from "./components/SftpPanel";
import TunnelModal from "./components/TunnelModal";
import AiDrawer from "./components/AiDrawer";
import OpencodePanel from "./components/OpencodePanel";
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
      if (mod && k === "p" && (!typing || terminalFocused)) {
        e.preventDefault();
        st.setPaletteOpen(!st.paletteOpen);
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
      } else if (k === "w") {
        e.preventDefault();
        if (st.activeId != null) st.requestClose(st.activeId);
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
  const requestClose = useSessionStore((s) => s.requestClose);
  const pendingCloseId = useSessionStore((s) => s.pendingCloseId);
  const confirmClose = useSessionStore((s) => s.confirmClose);
  const cancelClose = useSessionStore((s) => s.cancelClose);
  const duplicateTab = useSessionStore((s) => s.duplicateTab);
  const setConnectOpen = useSessionStore((s) => s.setConnectOpen);
  const connectOpen = useSessionStore((s) => s.connectOpen);
  const splitSession = useSessionStore((s) => s.splitSession);
  const hSplit = useSessionStore((s) => s.hSplit);
  const vSplit = useSessionStore((s) => s.vSplit);
  const setSplit = useSessionStore((s) => s.setSplit);
  const connectingIds = useSessionStore((s) => s.connectingIds);
  const setSettingsOpen = useSessionStore((s) => s.setSettingsOpen);
  const renameSession = useSessionStore((s) => s.renameSession);
  const setSessionColor = useSessionStore((s) => s.setSessionColor);
  const toggleReadOnly = useSessionStore((s) => s.toggleReadOnly);
  const toggleLog = useSessionStore((s) => s.toggleLog);
  const sessionLogs = useSessionStore((s) => s.sessionLogs);
  const tabCwd = useSessionStore((s) => s.tabCwd);
  const moveSession = useSessionStore((s) => s.moveSession);
  const sftpOpen = useSessionStore((s) => s.sftpOpen);
  const setSftpOpen = useSessionStore((s) => s.setSftpOpen);
  const setTunnelsOpen = useSessionStore((s) => s.setTunnelsOpen);
  const locked = useSessionStore((s) => s.locked);
  const lockEnabled = useSessionStore((s) => s.lockEnabled);
  const setLocked = useSessionStore((s) => s.setLocked);
  const broadcastOpen = useSessionStore((s) => s.broadcastOpen);
  const setBroadcastOpen = useSessionStore((s) => s.setBroadcastOpen);
  const aiOpen = useSessionStore((s) => s.aiOpen);
  const setAiOpen = useSessionStore((s) => s.setAiOpen);
  const opencodeOpen = useSessionStore((s) => s.opencodeOpen);
  const setOpencodeOpen = useSessionStore((s) => s.setOpencodeOpen);
  const accentColor = useSessionStore((s) => s.settings.accentColor);
  const language = useSessionStore((s) => s.settings.language);
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
  const [divDrag, setDivDrag] = useState<"v" | "h" | null>(null);

  useEffect(() => {
    if (!tabMenu) return;
    const close = () => setTabMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
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

  useEffect(() => {
    setLang(language === "en" ? "en" : "tr");
  }, [language]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accentColor);
  }, [accentColor]);

  const visible = sessions.filter((s) => visibleIds.includes(s.id));
  const count = visible.length;

  const DIV = "6px";
  const a = `${vSplit}fr`;
  const b = `${1 - vSplit}fr`;
  const c = `${hSplit}fr`;
  const d = `${1 - hSplit}fr`;

  let gridRows = "1fr";
  let gridCols = "1fr";
  let showV = false;
  let showH = false;

  if (count === 2) {
    if (splitDir === "row") {
      gridCols = `${a} ${DIV} ${b}`;
      showV = true;
    } else {
      gridRows = `${c} ${DIV} ${d}`;
      showH = true;
    }
  } else if (count === 3 || count >= 4) {
    gridRows = `${c} ${DIV} ${d}`;
    gridCols = `${a} ${DIV} ${b}`;
    showV = true;
    showH = true;
  }

  const panePos = (i: number): { col: string; row: string } | null => {
    if (i >= 4) return null;
    if (count === 2) {
      return splitDir === "row"
        ? { col: "1", row: "1" }
        : { col: "1", row: `${i === 0 ? "1" : "3"}` };
    }
    if (count === 3) {
      if (i === 0) {
        return splitDir === "row"
          ? { col: "1 / 3", row: "1" }
          : { col: "1", row: "1 / 3" };
      }
      return {
        col: i === 1 ? "1" : "3",
        row: i === 1 ? "3" : "3",
      };
    }
    return {
      col: i === 0 || i === 2 ? "1" : "3",
      row: i === 0 || i === 1 ? "1" : "3",
    };
  };

  const onDividerPointer = (axis: "v" | "h") => (e: React.PointerEvent) => {
    e.preventDefault();
    const area = e.currentTarget.parentElement as HTMLElement | null;
    if (!area) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setDivDrag(axis);
    document.body.style.userSelect = "none";
    document.body.style.cursor = axis === "v" ? "col-resize" : "row-resize";
    const move = (ev: PointerEvent) => {
      const rect = area.getBoundingClientRect();
      const frac =
        axis === "v"
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
      setSplit(axis, frac);
    };
    const up = () => {
      setDivDrag(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="tabbar">
          <button className="tab-connect" onClick={() => setConnectOpen(true)}>
            <span className="tab-connect-icon">🔌</span> {t("ssh.connect")}
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
              {s.readOnly && (
                <span className="tab-dot" title={t("tab.readonly")}>
                  🔒
                </span>
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
                  title={tabCwd[s.id] || s.title}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(s.id);
                    setEditTitle(s.title);
                  }}
                >
                  {s.title}
                  {tabCwd[s.id] && (
                    <span className="tab-cwd">{tabCwd[s.id]}</span>
                  )}
                </span>
              )}
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  requestClose(s.id);
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
              <div className="term-menu-label">{t("tab.color")}</div>
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
                  title={t("tab.clearColor")}
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
                {t("tab.rename")}
              </button>
              <button
                className="term-menu-item"
                onClick={() => {
                  toggleReadOnly(tabMenu.id);
                  setTabMenu(null);
                }}
              >
                {sessions.find((x) => x.id === tabMenu.id)?.readOnly
                  ? t("tab.readonlyOff")
                  : t("tab.readonly")}
              </button>
              {sessions.find((x) => x.id === tabMenu.id)?.kind === "local" && (
                <button
                  className="term-menu-item"
                  onClick={() => {
                    void toggleLog(tabMenu.id);
                    setTabMenu(null);
                  }}
                >
                  {sessionLogs[tabMenu.id]
                    ? t("tab.logStop")
                    : t("tab.logStart")}
                </button>
              )}
              <button
                className="term-menu-item"
                onClick={() => {
                  duplicateTab(tabMenu.id);
                  setTabMenu(null);
                }}
              >
                {t("tab.duplicate")}
              </button>
              <button
                className="term-menu-item"
                onClick={() => {
                  requestClose(tabMenu.id);
                  setTabMenu(null);
                }}
              >
                {t("tab.close")}
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
            title={t("tab.new")}
          >
            +
          </button>
          <div className="tabbar-spacer" />
          <button
            className="tab-split"
            onClick={() => splitSession("row")}
            title={t("split.h")}
          >
            ⇄
          </button>
          <button
            className="tab-split"
            onClick={() => splitSession("column")}
            title={t("split.v")}
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
            title={t("split.sftp")}
          >
            📁
          </button>
          <button
            className="tab-split"
            onClick={() => setTunnelsOpen(true)}
            title={t("split.tunnel")}
          >
            🔀
          </button>
          <button
            className="tab-split"
            onClick={() => setBroadcastOpen(!broadcastOpen)}
            title={t("split.broadcast")}
          >
            📢
          </button>
          <button
            className="tab-split"
            onClick={() => setLocked(true)}
            disabled={!lockEnabled}
            title={t("split.lock")}
          >
            🔒
          </button>
          <button
            className="tab-split"
            onClick={() => setSettingsOpen(true)}
            title={t("split.settings")}
          >
            ⚙
          </button>
          <button
            className={`tab-split ${aiOpen ? "tab-split-active" : ""}`}
            onClick={() => setAiOpen(!aiOpen)}
            title={t("split.ai")}
          >
            ✨
          </button>
          <button
            className={`tab-split ${opencodeOpen ? "tab-split-active" : ""}`}
            onClick={() => setOpencodeOpen(!opencodeOpen)}
            title={t("split.opencode")}
          >
            🧠
          </button>
        </div>
        {updateAvailable && (
          <div className="update-banner">
            <span className="update-banner-text">
              🆕 {t("update.banner", { version: updateAvailable.version })}
            </span>
            <button
              className="btn-primary"
              onClick={() => void downloadAndInstall()}
            >
              {t("update.install")}
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
              {sessions.filter((s) => !deadIds.includes(s.id)).length}{" "}
              {t("broadcast.to")}
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
              placeholder={t("broadcast.placeholder")}
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
          }}
        >
          {count === 0 && sessions.length === 0 ? (
            <div className="empty-state">{t("empty.state")}</div>
          ) : (
            sessions.map((s) => {
              const visIndex = visibleIds.indexOf(s.id);
              const isVisible = visIndex >= 0;
              const pos = isVisible ? panePos(visIndex) : null;
              return (
                <div
                  key={s.id}
                  className={`term-slot ${s.id === activeId ? "active" : "inactive"}`}
                  style={{
                    gridColumn: pos?.col,
                    gridRow: pos?.row,
                    display: isVisible ? undefined : "none",
                  }}
                  onClick={() => focusSession(s.id)}
                >
                  <TerminalView session={s} active={s.id === activeId} />
                </div>
              );
            })
          )}
          {showV && (
            <div
              className={`pane-divider pane-divider-v ${
                divDrag === "v" ? "dragging" : ""
              }`}
              onPointerDown={onDividerPointer("v")}
            />
          )}
          {showH && (
            <div
              className={`pane-divider pane-divider-h ${
                divDrag === "h" ? "dragging" : ""
              }`}
              onPointerDown={onDividerPointer("h")}
            />
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
      <AiDrawer />
      <OpencodePanel />
      {pendingCloseId != null && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="modal modal-small" onMouseDown={(e) => e.stopPropagation()}>
            <h2>{t("tab.close")}</h2>
            <p>
              <strong>{sessions.find((s) => s.id === pendingCloseId)?.title}</strong>{" "}
              {t("app.exitConfirm")}
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={cancelClose}>
                {t("delete.cancel")}
              </button>
              <button className="btn btn-danger" onClick={confirmClose}>
                {t("tab.close")}
              </button>
            </div>
          </div>
        </div>
      )}
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