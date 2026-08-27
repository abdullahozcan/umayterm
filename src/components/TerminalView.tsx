import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSessionStore } from "../store";
import { THEMES, toXtermTheme } from "../themes";
import SysStatsPanel from "./SysStatsPanel";
import type {
  PtyExitPayload,
  Session,
  SshClosePayload,
  SshErrorPayload,
  SshExitPayload,
  SshStats,
} from "../types";
import "@xterm/xterm/css/xterm.css";
import "../styles/terminal.css";

export default function TerminalView({
  session,
  active,
}: {
  session: Session;
  active: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const connecting = useSessionStore((s) => s.connectingIds.includes(session.id));
  const dead = useSessionStore((s) => s.deadIds.includes(session.id));
  const reconnect = useSessionStore((s) => s.reconnect);
  const themeId = useSessionStore((s) => s.themeId);
  const fontSize = useSessionStore((s) => s.fontSize);
  const settings = useSessionStore((s) => s.settings);
  const statsOpen = useSessionStore((s) => !!s.statsOpen[session.id]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);
  const writeRef = useRef<(s: string) => void>(() => {});
  const confirmPasteRef = useRef(settings.confirmMultilinePaste);
  confirmPasteRef.current = settings.confirmMultilinePaste;
  const bellEnabledRef = useRef(settings.bellStyle === "sound");
  bellEnabledRef.current = settings.bellStyle === "sound";

  useEffect(() => {
    const isSsh = session.kind === "ssh";
    const theme = toXtermTheme(THEMES[themeId] ?? THEMES.onedark);
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.15,
      allowProposedApi: true,
      scrollback: 10000,
      theme,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_event, uri) => {
      if (/^(https?|mailto):/i.test(uri)) {
        window.open(uri, "_blank", "noopener");
      }
    }));
    term.loadAddon(new Unicode11Addon());
    const search = new SearchAddon();
    term.loadAddon(search);
    searchRef.current = search;
    term.open(containerRef.current!);
    termRef.current = term;
    fitRef.current = fit;
    if (activeRef.current) {
      term.focus();
    }

    const encoder = new TextEncoder();
    const writeInput = (data: string) => {
      const bytes = Array.from(encoder.encode(data));
      if (isSsh) {
        invoke("ssh_write", { id: session.id, data: bytes }).catch(() => {});
      } else {
        invoke("write_to_pty", { id: session.id, data: bytes }).catch(() => {});
      }
    };
    writeRef.current = writeInput;
    const dataSub = term.onData(writeInput);
    let audioCtx: AudioContext | null = null;
    const bellSub = term.onBell(() => {
      if (!bellEnabledRef.current) return;
      try {
        audioCtx = audioCtx ?? new AudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } catch {
        // ses çalınamadı, yoksay
      }
    });

    const sendResize = () => {
      const t = termRef.current;
      if (!t) return;
      if (isSsh) {
        invoke("ssh_resize", {
          id: session.id,
          cols: t.cols,
          rows: t.rows,
        }).catch(() => {});
      } else {
        invoke("resize_pty", {
          id: session.id,
          cols: t.cols,
          rows: t.rows,
        }).catch(() => {});
      }
    };

    const subs: Promise<() => void>[] = [];
    let busy = false;
    let tick = 0;
    const pollId = setInterval(() => {
      tick++;
      if (!activeRef.current || document.hidden) {
        if (tick % 15 !== 0) return;
      }
      if (busy) return;
      busy = true;
      const cmd = isSsh ? "ssh_poll" : "pty_poll";
      invoke<Uint8Array>(cmd, { id: session.id })
        .then((res) => {
          const data = res as unknown;
          if (data instanceof Uint8Array && data.length > 0) {
            term.write(data);
          } else if (data instanceof ArrayBuffer && data.byteLength > 0) {
            term.write(new Uint8Array(data));
          } else if (data != null && typeof data === "object") {
            const len = (data as { length?: number }).length;
            if (typeof len === "number" && len > 0) {
              term.write(Uint8Array.from(data as ArrayLike<number>));
            }
          } else {
            console.warn(`[poll] beklenmeyen yanıt (${cmd}):`, data);
          }
        })
        .catch((e) => {
          console.error(`[poll] invoke hatası (${cmd}):`, e);
        })
        .finally(() => {
          busy = false;
        });
    }, 30);
    if (isSsh) {
      subs.push(
        listen<SshExitPayload>("ssh-exit", (event) => {
          if (event.payload.id === session.id) {
            term.write(
              `\r\n\x1b[31m[oturum kapandı, çıkış kodu: ${event.payload.code}]\x1b[0m\r\n`,
            );
          }
        }),
      );
      subs.push(
        listen<SshErrorPayload>("ssh-error", (event) => {
          if (event.payload.id === session.id) {
            term.write(`\r\n\x1b[31m[${event.payload.message}]\x1b[0m\r\n`);
          }
        }),
      );
      subs.push(
        listen<SshClosePayload>("ssh-close", (event) => {
          if (event.payload.id === session.id) {
            term.write("\r\n\x1b[33m[bağlantı kapatıldı]\x1b[0m\r\n");
          }
        }),
      );
    } else {
      invoke<number>("open_pty", {
        sessionId: session.id,
        cols: 80,
        rows: 24,
        cwd: session.cwd ?? null,
      })
        .then(() => {})
        .catch((e) => {
          term.write(`\r\n\x1b[31m[zsh başlatılamadı: ${e}]\x1b[0m\r\n`);
        });
      subs.push(
        listen<PtyExitPayload>("pty-exit", (event) => {
          if (event.payload.id === session.id) {
            term.write("\r\n\x1b[31m[oturum sonlandı]\x1b[0m\r\n");
          }
        }),
      );
    }

    const onResize = () => {
      const t = termRef.current;
      if (!t) return;
      fit.fit();
      if (t.cols < 2 || t.rows < 2) return;
      sendResize();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(containerRef.current!);
    if (activeRef.current) {
      setTimeout(onResize, 100);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen((v) => {
          if (!v) {
            setTimeout(() => searchInputRef.current?.focus(), 0);
          }
          return !v;
        });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === "c") {
          e.preventDefault();
          const sel = term.getSelection();
          if (sel) void navigator.clipboard.writeText(sel);
          return;
        }
        if (k === "v") {
          e.preventDefault();
          void navigator.clipboard.readText().then((txt) => {
            if (txt && txt.includes("\n") && confirmPasteRef.current) {
              setPendingPaste(txt);
            } else {
              writeRef.current(txt);
            }
          });
        }
      }
    };
    const container = containerRef.current!;
    container.addEventListener("keydown", onKeyDown);

    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text");
      if (text && text.includes("\n") && confirmPasteRef.current) {
        e.preventDefault();
        setPendingPaste(text);
      }
    };
    container.addEventListener("paste", onPaste);

    return () => {
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("paste", onPaste);
      ro.disconnect();
      clearInterval(pollId);
      dataSub.dispose();
      bellSub.dispose();
      subs.forEach((p) => p.then((f) => f()));
      term.dispose();
    };
  }, [session.id, session.kind]);

  useEffect(() => {
    if (!active) return;
    const t = termRef.current;
    if (!t) return;
    t.focus();
    const raf = requestAnimationFrame(() => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term || !fit) return;
      fit.fit();
      if (term.cols < 2 || term.rows < 2) return;
      if (session.kind === "ssh") {
        invoke("ssh_resize", {
          id: session.id,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
      } else {
        invoke("resize_pty", {
          id: session.id,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [active, session.id, session.kind]);

  useEffect(() => {
    if (session.kind !== "ssh" || !statsOpen) return;
    const id = session.id;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const poll = async () => {
      const st = useSessionStore.getState();
      if (st.deadIds.includes(id)) {
        stop();
        return;
      }
      try {
        const data = await invoke<SshStats>("ssh_stats", { id });
        if (!stopped) {
          useSessionStore.getState().setStats(id, data);
        }
      } catch (e) {
        if (!stopped) {
          useSessionStore.getState().setStats(id, {
            ok: false,
            error: String(e),
            load: [],
            fs: [],
          });
        }
        stop();
      }
    };
    void poll();
    timer = setInterval(() => void poll(), 2500);
    return () => {
      stopped = true;
      stop();
    };
  }, [session.id, session.kind, statsOpen]);

  useEffect(() => {
    const t = termRef.current;
    const theme = toXtermTheme(THEMES[themeId] ?? THEMES.onedark);
    if (t) {
      t.options.theme = theme;
      t.options.fontSize = fontSize;
      t.options.fontFamily = settings.fontFamily;
      t.options.lineHeight = settings.lineHeight;
      t.options.scrollback = settings.scrollback;
    }
    const root = document.documentElement;
    root.style.setProperty("--term-bg", theme.background);
    root.style.setProperty("--term-fg", theme.foreground);
  }, [themeId, fontSize, settings]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("wheel", close, { passive: true });
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("wheel", close);
    };
  }, [menu]);

  const doCopy = () => {
    const t = termRef.current;
    if (t?.hasSelection()) void navigator.clipboard.writeText(t.getSelection());
    setMenu(null);
  };

  const doSelectAll = () => {
    termRef.current?.selectAll();
    setMenu(null);
  };

  const doPaste = () => {
    setMenu(null);
    void navigator.clipboard.readText().then((txt) => {
      if (txt && txt.includes("\n") && settings.confirmMultilinePaste) {
        setPendingPaste(txt);
      } else {
        writeRef.current(txt);
      }
    });
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div className="terminal-wrap" onContextMenu={onContextMenu}>
      {session.kind === "ssh" && <SysStatsPanel sessionId={session.id} />}
      <div ref={containerRef} className="terminal-container" />
      {menu && (
        <div className="term-menu" style={{ left: menu.x, top: menu.y }}>
          <button
            className="term-menu-item"
            disabled={!termRef.current?.hasSelection()}
            onClick={doCopy}
          >
            Kopyala
          </button>
          <button className="term-menu-item" onClick={doPaste}>
            Yapıştır
          </button>
          <button className="term-menu-item" onClick={doSelectAll}>
            Tümünü seç
          </button>
          {dead && session.kind === "ssh" && (
            <>
              <div className="term-menu-sep" />
              <button
                className="term-menu-item"
                onClick={() => {
                  setMenu(null);
                  reconnect(session.id);
                }}
              >
                ⟳ Yeniden Bağlan
              </button>
            </>
          )}
        </div>
      )}
      {pendingPaste != null && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Çok satırlı yapıştırma onayı</h2>
            <p className="hostkey-text">
              Yapıştırılacak metin birden fazla satır içeriyor. Göndermeden önce
              komutu kontrol edin:
            </p>
            <pre className="paste-preview">{pendingPaste}</pre>
            <div className="modal-actions">
              <button className="btn" onClick={() => setPendingPaste(null)}>
                İptal
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  writeRef.current(pendingPaste);
                  setPendingPaste(null);
                }}
              >
                Gönder
              </button>
            </div>
          </div>
        </div>
      )}
      {searchOpen && (
        <div className="terminal-search">
          <input
            ref={searchInputRef}
            value={searchQuery}
            placeholder="Ara (Enter: sonraki, Shift+Enter: önceki, Esc: kapat)"
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchRef.current?.findNext(e.target.value, { incremental: true });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) {
                  searchRef.current?.findPrevious(searchQuery);
                } else {
                  searchRef.current?.findNext(searchQuery);
                }
              } else if (e.key === "Escape") {
                setSearchOpen(false);
                searchRef.current?.clearDecorations();
              }
            }}
          />
        </div>
      )}
      {connecting && session.kind === "ssh" && (
        <div className="connecting-overlay">
          <div className="spinner" />
          <div className="connecting-text">
            Bağlanılıyor: {session.title}…
          </div>
        </div>
      )}
      {dead && !connecting && session.kind === "ssh" && (
        <button className="reconnect-btn" onClick={() => reconnect(session.id)}>
          ⟳ Yeniden Bağlan
        </button>
      )}
    </div>
  );
}