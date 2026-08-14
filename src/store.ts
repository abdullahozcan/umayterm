import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check as checkForUpdate, Update } from "@tauri-apps/plugin-updater";
import { DEFAULT_THEME_ID, THEMES, getThemeConfig } from "./themes";
import type {
  HostKeyPromptPayload,
  HostRecord,
  RestorableSession,
  Session,
  Snippet,
  SshClosePayload,
  SshConnectParams,
  TunnelInfo,
} from "./types";

let nextTabId = 1;
let idCounter = 1;

function genId(): number {
  return idCounter++;
}

function writeSession(id: number, text: string) {
  const session = useSessionStore.getState().sessions.find((s) => s.id === id);
  if (!session) return;
  const bytes = Array.from(new TextEncoder().encode(text));
  if (session.kind === "ssh") {
    invoke("ssh_write", { id, data: bytes }).catch(() => {});
  } else {
    invoke("write_to_pty", { id, data: bytes }).catch(() => {});
  }
}

export interface PendingHostKey {
  id: number;
  fingerprint: string;
  changed: boolean;
  params: SshConnectParams;
}

export interface AppSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  scrollback: number;
  bellStyle: "none" | "sound";
  keepaliveSecs: number;
  confirmMultilinePaste: boolean;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string) {
  useSessionStore.setState({ toast: message });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    useSessionStore.setState({ toast: null });
  }, 5000);
}

const DEFAULT_SETTINGS: AppSettings = {
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  fontSize: 13,
  lineHeight: 1.15,
  scrollback: 10000,
  bellStyle: "none",
  keepaliveSecs: 30,
  confirmMultilinePaste: true,
};

function parseSettings(raw: Record<string, string>): AppSettings {
  const s = { ...DEFAULT_SETTINGS };
  if (raw.fontFamily) s.fontFamily = raw.fontFamily;
  if (raw.fontSize) {
    const n = parseInt(raw.fontSize, 10);
    if (Number.isFinite(n)) s.fontSize = n;
  }
  if (raw.lineHeight) {
    const n = parseFloat(raw.lineHeight);
    if (Number.isFinite(n)) s.lineHeight = n;
  }
  if (raw.scrollback) {
    const n = parseInt(raw.scrollback, 10);
    if (Number.isFinite(n) && n > 0) s.scrollback = n;
  }
  if (raw.bellStyle === "none" || raw.bellStyle === "sound") s.bellStyle = raw.bellStyle;
  if (raw.keepaliveSecs) {
    const n = parseInt(raw.keepaliveSecs, 10);
    if (Number.isFinite(n) && n > 0) s.keepaliveSecs = n;
  }
  if (raw.confirmMultilinePaste === "false") s.confirmMultilinePaste = false;
  return s;
}

interface SessionStore {
  sessions: Session[];
  activeId: number | null;
  visibleIds: number[];
  splitDir: "row" | "column";
  connectOpen: boolean;
  snippetOpen: boolean;
  pendingHostKey: PendingHostKey | null;
  editingHost: HostRecord | null;
  hosts: HostRecord[];
  snippets: Snippet[];
  connectingIds: number[];
  deadIds: number[];
  themeId: string;
  fontSize: number;
  settings: AppSettings;
  settingsOpen: boolean;
  paletteOpen: boolean;
  sftpOpen: boolean;
  sftpSessionId: number | null;
  tunnelsOpen: boolean;
  tunnels: TunnelInfo[];
  locked: boolean;
  lockEnabled: boolean;
  broadcastOpen: boolean;
  updateAvailable: Update | null;
  updateChecking: boolean;
  toast: string | null;
  clearToast: () => void;
  activate: (id: number) => void;
  focusSession: (id: number) => void;
  duplicateTab: (id: number) => void;
  openLocal: (color?: string | null, cwd?: string | null) => void;
  openSsh: (
    params: Omit<SshConnectParams, "session_id" | "cols" | "rows">,
    color?: string | null,
  ) => void;
  close: (id: number) => void;
  reconnect: (id: number) => void;
  markDead: (id: number) => void;
  renameSession: (id: number, title: string) => void;
  setSessionColor: (id: number, color: string | null) => void;
  moveSession: (fromId: number, toId: number) => void;
  saveSessions: () => Promise<void>;
  restoreSessions: () => Promise<number>;
  zoomFont: (delta: number) => void;
  setFontSize: (size: number) => void;
  loadSettings: () => Promise<void>;
  updateSetting: (key: keyof AppSettings, value: string | number | boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setSftpOpen: (open: boolean, sessionId?: number) => void;
  setTunnelsOpen: (open: boolean) => void;
  loadTunnels: () => Promise<void>;
  createTunnel: (
    sshSessionId: number,
    kind: string,
    listenPort: number,
    targetHost: string,
    targetPort: number,
  ) => Promise<void>;
  closeTunnel: (id: number) => Promise<void>;
  setConnectOpen: (open: boolean) => void;
  setSnippetOpen: (open: boolean) => void;
  startEditHost: (host: HostRecord) => void;
  clearEditHost: () => void;
  setPendingHostKey: (key: PendingHostKey | null) => void;
  confirmHostKey: () => void;
  rejectHostKey: () => void;
  loadHosts: () => Promise<void>;
  saveHost: (host: HostRecord) => Promise<void>;
  deleteHost: (id: number) => Promise<void>;
  exportHosts: () => Promise<string>;
  importHosts: (json: string) => Promise<number>;
  importSshConfig: () => Promise<number>;
  connectToHost: (host: HostRecord, color?: string | null) => void;
  setConnecting: (connecting: boolean, id: number) => void;
  setTheme: (id: string) => void;
  splitSession: (dir: "row" | "column") => void;
  setSplitDir: (dir: "row" | "column") => void;
  loadSnippets: () => Promise<void>;
  saveSnippet: (snippet: Snippet) => Promise<void>;
  deleteSnippet: (id: number) => Promise<void>;
  runSnippet: (snippet: Snippet) => void;
  checkLockStatus: () => Promise<boolean>;
  setLocked: (locked: boolean) => void;
  lockSetup: (current: string | null, newPassword: string) => Promise<void>;
  lockVerify: (password: string) => Promise<boolean>;
  lockClear: (current: string) => Promise<void>;
  setBroadcastOpen: (open: boolean) => void;
  broadcastSend: (text: string) => number;
  checkForUpdates: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
}

let hostKeyListener: Promise<() => void> | null = null;

function loadTheme(): string {
  try {
    return localStorage.getItem("umayterm-theme") || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function loadFontSize(): number {
  try {
    const v = parseInt(localStorage.getItem("umayterm-fontsize") || "", 10);
    return Number.isFinite(v) && v >= 8 && v <= 32 ? v : 13;
  } catch {
    return 13;
  }
}

export function applyThemeBackend(id: string) {
  const theme = THEMES[id];
  if (!theme) return;
  const cfg = getThemeConfig(theme);
  invoke("apply_theme", {
    theme: {
      prompt_user: cfg.promptUser,
      prompt_dir: cfg.promptDir,
      prompt_symbol: cfg.promptSymbol,
      ls_colors: cfg.lsColors,
    },
  }).catch(() => {});
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeId: null,
  visibleIds: [],
  splitDir: "row",
  connectOpen: false,
  snippetOpen: false,
  pendingHostKey: null,
  editingHost: null,
  hosts: [],
  snippets: [],
  connectingIds: [],
  deadIds: [],
  themeId: loadTheme(),
  fontSize: loadFontSize(),
  settings: { ...DEFAULT_SETTINGS, fontSize: loadFontSize() },
  settingsOpen: false,
  paletteOpen: false,
  sftpOpen: false,
  sftpSessionId: null,
  tunnelsOpen: false,
  tunnels: [],
  locked: false,
  lockEnabled: false,
  broadcastOpen: false,
  updateAvailable: null,
  updateChecking: false,
  toast: null,
  clearToast: () => set({ toast: null }),

  activate: (id) => set({ activeId: id, visibleIds: [id] }),

  focusSession: (id) => set({ activeId: id }),

  openLocal: (color, cwd) => {
    const id = genId();
    const session: Session = {
      id,
      title: `zsh (${nextTabId++})`,
      kind: "local",
      color: color ?? null,
      cwd: cwd ?? null,
    };
    set((s) => ({
      sessions: [...s.sessions, session],
      activeId: id,
      visibleIds: [id],
    }));
  },

  openSsh: (params, color) => {
    const id = genId();
    const full: SshConnectParams = {
      ...params,
      session_id: id,
      cols: 80,
      rows: 24,
    };
    invoke("ssh_connect", { params: full }).catch(() => {});
    const session: Session = {
      id,
      title: `${params.username}@${params.host}`,
      kind: "ssh",
      params: full,
      color: color ?? null,
    };
    set((s) => ({
      sessions: [...s.sessions, session],
      activeId: id,
      visibleIds: [id],
      connectingIds: [...s.connectingIds, id],
    }));
  },

  close: (id) => {
    invoke("close_pty", { id }).catch(() => {});
    invoke("ssh_close", { id }).catch(() => {});
    const pending = get().pendingHostKey;
    if (pending?.id === id) {
      invoke("ssh_reject_host_key", { sessionId: id }).catch(() => {});
      set({ pendingHostKey: null });
    }
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);
      const visibleIds = s.visibleIds.filter((x) => x !== id);
      if (visibleIds.length === 0 && sessions.length > 0) {
        visibleIds.push(sessions[sessions.length - 1].id);
      }
      const activeId =
        s.activeId === id
          ? (visibleIds[visibleIds.length - 1] ?? null)
          : s.activeId;
      return {
        sessions,
        visibleIds,
        activeId,
        connectingIds: s.connectingIds.filter((x) => x !== id),
        deadIds: s.deadIds.filter((x) => x !== id),
      };
    });
  },

  reconnect: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session || session.kind !== "ssh" || !session.params) return;
    invoke("ssh_connect", { params: session.params }).catch(() => {});
    get().setConnecting(true, id);
  },

  duplicateTab: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;
    if (session.kind === "local") {
      get().openLocal(session.color, session.cwd);
    } else if (session.params) {
      const { session_id: _sid, cols: _c, rows: _r, ...rest } = session.params;
      get().openSsh(rest, session.color);
    }
  },

  markDead: (id) => {
    const alive = get().sessions.some((s) => s.id === id);
    if (!alive) return;
    set((s) => (s.deadIds.includes(id) ? s : { deadIds: [...s.deadIds, id] }));
  },

  renameSession: (id, title) => {
    const t = title.trim();
    if (!t) return;
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, title: t } : x)),
    }));
  },

  setSessionColor: (id, color) => {
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, color } : x)),
    }));
  },

  moveSession: (fromId, toId) => {
    if (fromId === toId) return;
    set((s) => {
      const sessions = [...s.sessions];
      const from = sessions.findIndex((x) => x.id === fromId);
      const to = sessions.findIndex((x) => x.id === toId);
      if (from < 0 || to < 0) return s;
      const [m] = sessions.splice(from, 1);
      sessions.splice(to, 0, m);
      return { sessions };
    });
  },

  saveSessions: async () => {
    const out: RestorableSession[] = get()
      .sessions.map((x) => ({
        kind: x.kind,
        title: x.title,
        color: x.color ?? null,
        host: x.params?.host ?? null,
        port: x.params?.port ?? null,
        username: x.params?.username ?? null,
      }))
      .filter((x) => x.kind === "local" || x.host);
    await invoke("session_save", { sessions: out }).catch(() => {});
  },

  restoreSessions: async () => {
    const saved = await invoke<RestorableSession[]>("session_load").catch(() => []);
    if (saved.length === 0) return 0;
    const hosts = get().hosts;
    let restored = 0;
    for (const s of saved) {
      if (s.kind === "local") {
        get().openLocal(s.color);
        restored++;
      } else if (s.host && s.port && s.username) {
        const host = hosts.find(
          (h) =>
            h.host === s.host && h.port === s.port && h.username === s.username,
        );
        if (host) {
          get().connectToHost(host, s.color);
          restored++;
        }
      }
    }
    return restored;
  },

  zoomFont: (delta) => {
    const next = Math.min(32, Math.max(8, get().fontSize + delta));
    get().setFontSize(next);
  },

  setFontSize: (size) => {
    try {
      localStorage.setItem("umayterm-fontsize", String(size));
    } catch {
      // ignore
    }
    set({ fontSize: size, settings: { ...get().settings, fontSize: size } });
    invoke("settings_set", { key: "fontSize", value: String(size) }).catch(() => {});
  },

  loadSettings: async () => {
    const raw = await invoke<Record<string, string>>("settings_get_all").catch(() => ({}));
    const settings = parseSettings(raw);
    set({ settings, fontSize: settings.fontSize });
  },

  updateSetting: (key, value) => {
    const settings = { ...get().settings, [key]: value } as AppSettings;
    set({ settings, fontSize: settings.fontSize });
    if (key === "fontSize") {
      try {
        localStorage.setItem("umayterm-fontsize", String(value));
      } catch {
        // ignore
      }
    }
    invoke("settings_set", { key, value: String(value) }).catch(() => {});
  },

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setPaletteOpen: (open) => set({ paletteOpen: open }),

  setSftpOpen: (open, sessionId) =>
    set((s) => ({
      sftpOpen: open,
      sftpSessionId: open ? (sessionId ?? s.sftpSessionId) : s.sftpSessionId,
    })),

  setTunnelsOpen: (open) => set({ tunnelsOpen: open }),

  loadTunnels: async () => {
    const tunnels = await invoke<TunnelInfo[]>("tunnel_list").catch(() => []);
    set({ tunnels });
  },

  createTunnel: async (sshSessionId, kind, listenPort, targetHost, targetPort) => {
    await invoke<TunnelInfo>("tunnel_open", {
      sshSessionId,
      kind,
      listenPort,
      targetHost,
      targetPort,
    });
    await get().loadTunnels();
  },

  closeTunnel: async (id) => {
    await invoke("tunnel_close", { id });
    await get().loadTunnels();
  },

  setConnectOpen: (open) => set({ connectOpen: open }),

  setSnippetOpen: (open) => set({ snippetOpen: open }),

  startEditHost: (host) => set({ editingHost: host, connectOpen: true }),

  clearEditHost: () => set({ editingHost: null }),

  setPendingHostKey: (key) => set({ pendingHostKey: key }),

  confirmHostKey: () => {
    const pending = get().pendingHostKey;
    if (!pending) return;
    invoke("ssh_accept_host_key", {
      sessionId: pending.id,
      fingerprint: pending.fingerprint,
      host: pending.params.host,
      port: pending.params.port,
    }).catch(() => {});
    invoke("ssh_connect", { params: pending.params }).catch(() => {});
    get().setConnecting(true, pending.id);
    set({ pendingHostKey: null });
  },

  rejectHostKey: () => {
    const pending = get().pendingHostKey;
    if (pending) {
      invoke("ssh_reject_host_key", { sessionId: pending.id }).catch(() => {});
      get().close(pending.id);
    }
    set({ pendingHostKey: null });
  },

  loadHosts: async () => {
    const hosts = await invoke<HostRecord[]>("host_list").catch(() => []);
    set({ hosts });
  },

  saveHost: async (host) => {
    try {
      await invoke<number>("host_save", { host });
    } catch (e) {
      showToast(String(e));
    }
    await get().loadHosts();
  },

  deleteHost: async (id) => {
    try {
      await invoke("host_delete", { id });
    } catch (e) {
      showToast(String(e));
    }
    await get().loadHosts();
  },

  exportHosts: async () => {
    return await invoke<string>("hosts_export").catch((e) => {
      throw new Error(String(e));
    });
  },

  importHosts: async (json) => {
    const hosts = JSON.parse(json) as HostRecord[];
    const n = await invoke<number>("hosts_import", { hosts }).catch((e) => {
      throw new Error(String(e));
    });
    await get().loadHosts();
    return n;
  },

  importSshConfig: async () => {
    const n = await invoke<number>("ssh_config_import").catch((e) => {
      throw new Error(String(e));
    });
    await get().loadHosts();
    return n;
  },

  connectToHost: (host, color) => {
    const auth = host.authMethod === "key"
      ? {
          method: "key" as const,
          key_path: host.keyPath ?? "",
          passphrase: host.passphrase ?? null,
        }
      : host.authMethod === "agent"
        ? { method: "agent" as const }
        : {
            method: "password" as const,
            password: host.password ?? "",
          };
    const jump =
      host.jumpHost && host.jumpUser
        ? {
            host: host.jumpHost,
            port: host.jumpPort ?? 22,
            username: host.jumpUser,
            auth: { method: "password" as const, password: host.jumpPassword ?? "" },
          }
        : null;
    get().openSsh(
      {
        host: host.host,
        port: host.port,
        username: host.username,
        auth,
        jump,
      },
      color,
    );
  },

  setConnecting: (connecting, id) => {
    set((s) => ({
      connectingIds: connecting
        ? [...s.connectingIds, id]
        : s.connectingIds.filter((x) => x !== id),
    }));
  },

  setTheme: (id) => {
    try {
      localStorage.setItem("umayterm-theme", id);
    } catch {
      // ignore
    }
    set({ themeId: id });
    applyThemeBackend(id);
  },

  splitSession: (dir) => {
    const id = genId();
    const session: Session = { id, title: `zsh (${nextTabId++})`, kind: "local" };
    set((s) => ({
      sessions: [...s.sessions, session],
      activeId: id,
      visibleIds: [...s.visibleIds, id],
      splitDir: dir,
    }));
  },

  setSplitDir: (dir) => set({ splitDir: dir }),

  loadSnippets: async () => {
    const snippets = await invoke<Snippet[]>("snippet_list").catch(() => []);
    set({ snippets });
  },

  saveSnippet: async (snippet) => {
    await invoke<number>("snippet_save", { snippet }).catch(() => {});
    await get().loadSnippets();
  },

  deleteSnippet: async (id) => {
    await invoke("snippet_delete", { id }).catch(() => {});
    await get().loadSnippets();
  },

  runSnippet: (snippet) => {
    const active = get().activeId;
    if (active == null) return;
    writeSession(active, snippet.command);
  },

  checkLockStatus: async () => {
    const enabled = await invoke<boolean>("lock_status").catch(() => false);
    set({ lockEnabled: enabled });
    return enabled;
  },

  setLocked: (locked) => {
    if (locked) {
      set({ locked: true, hosts: [] });
    } else {
      set({ locked: false });
    }
  },

  lockSetup: async (current, newPassword) => {
    await invoke("lock_setup", { current, newPassword }).catch((e) => {
      throw new Error(String(e));
    });
    set({ lockEnabled: true });
  },

  lockVerify: async (password) => {
    return await invoke<boolean>("lock_verify", { password }).catch(() => false);
  },

  lockClear: async (current) => {
    await invoke("lock_clear", { current }).catch((e) => {
      throw new Error(String(e));
    });
    set({ lockEnabled: false });
  },

  setBroadcastOpen: (open) => set({ broadcastOpen: open }),

  broadcastSend: (text) => {
    if (!text) return 0;
    const payload = Array.from(new TextEncoder().encode(text));
    let sent = 0;
    for (const s of get().sessions) {
      if (get().deadIds.includes(s.id)) continue;
      const invokeArgs = { id: s.id, data: payload };
      if (s.kind === "ssh") {
        invoke("ssh_write", invokeArgs).catch(() => {});
      } else {
        invoke("write_to_pty", invokeArgs).catch(() => {});
      }
      sent++;
    }
    return sent;
  },

  checkForUpdates: async () => {
    if (get().updateChecking) return;
    set({ updateChecking: true, updateAvailable: null });
    try {
      const update = await checkForUpdate();
      set({ updateAvailable: update });
    } catch {
      set({ updateAvailable: null });
    } finally {
      set({ updateChecking: false });
    }
  },

  downloadAndInstall: async () => {
    const update = get().updateAvailable;
    if (!update) return;
    set({ updateChecking: true });
    try {
      await update.downloadAndInstall();
    } finally {
      set({ updateChecking: false });
    }
  },
}));

if (!hostKeyListener) {
  hostKeyListener = listen<HostKeyPromptPayload>("ssh-host-key", (event) => {
    const { id, fingerprint, changed } = event.payload;
    const session = useSessionStore.getState().sessions.find((s) => s.id === id);
    if (!session?.params) return;
    void useSessionStore.getState().setPendingHostKey({
      id,
      fingerprint,
      changed,
      params: session.params,
    });
  });
  void listen<SshClosePayload>("ssh-connected", (event) => {
    useSessionStore.getState().setPendingHostKey(null);
    useSessionStore.getState().setConnectOpen(false);
    useSessionStore.getState().setConnecting(false, event.payload.id);
    useSessionStore.setState((s) => ({
      deadIds: s.deadIds.filter((x) => x !== event.payload.id),
    }));
  });
  void listen<{ id: number }>("ssh-error", (event) => {
    useSessionStore.getState().setConnecting(false, event.payload.id);
    useSessionStore.getState().markDead(event.payload.id);
  });
  void listen<{ id: number }>("ssh-close", (event) => {
    useSessionStore.getState().setConnecting(false, event.payload.id);
    useSessionStore.getState().markDead(event.payload.id);
  });
}