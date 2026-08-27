import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useSessionStore } from "../store";
import type { SftpDone, SftpEntry, SftpProgress } from "../types";

function fmtSize(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface Transfer {
  opId: number;
  name: string;
  dir: "down" | "up";
  transferred: number;
  total: number;
  done: boolean;
  error: string | null;
}

let sftpOpId = 1;

export default function SftpPanel() {
  const sessionId = useSessionStore((s) => s.sftpSessionId);
  const setSftpOpen = useSessionStore((s) => s.setSftpOpen);
  const sessions = useSessionStore((s) => s.sessions);
  const deadIds = useSessionStore((s) => s.deadIds);
  const [cwd, setCwd] = useState("/");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const seqRef = useRef(0);
  const loadRef = useRef<(p: string) => Promise<void>>(async () => {});
  const cwdRef = useRef("/");
  const session = sessions.find((x) => x.id === sessionId);

  useEffect(() => {
    if (sessionId == null || session) return;
    setSftpOpen(false);
  }, [sessions, sessionId, session, setSftpOpen]);

  useEffect(() => {
    if (sessionId != null && deadIds.includes(sessionId)) {
      setSftpOpen(false);
    }
  }, [deadIds, sessionId, setSftpOpen]);

  useEffect(() => {
    const unsubs: Promise<() => void>[] = [
      listen<SftpProgress>("sftp-progress", (event) => {
        const p = event.payload;
        setTransfers((list) =>
          list.map((t) =>
            t.opId === p.opId
              ? { ...t, transferred: p.transferred, total: p.total }
              : t,
          ),
        );
      }),
      listen<SftpDone>("sftp-done", (event) => {
        const p = event.payload;
        setTransfers((list) =>
          list.map((t) =>
            t.opId === p.opId ? { ...t, done: true, error: p.error ?? null } : t,
          ),
        );
        if (p.ok) {
          void loadRef.current(cwdRef.current);
        }
      }),
    ];
    return () => {
      unsubs.forEach((u) => u.then((f) => f()));
    };
  }, []);

  const load = useCallback(
    async (path: string) => {
      if (sessionId == null) return;
      const seq = ++seqRef.current;
      setLoading(true);
      setStatus("");
      try {
        const list = await invoke<SftpEntry[]>("sftp_list", {
          sessionId,
          path,
        });
        if (seq !== seqRef.current) return;
        setEntries(list);
        setCwd(path);
      } catch (e) {
        if (seq !== seqRef.current) return;
        setStatus(String(e));
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (sessionId != null) {
      cwdRef.current = "/";
      void load("/");
    }
  }, [sessionId, load]);

  useEffect(() => {
    loadRef.current = load;
    cwdRef.current = cwd;
  }, [load, cwd]);

  if (sessionId == null || !session) return null;

  const goUp = () => {
    const idx = cwd.lastIndexOf("/", cwd.length - 2);
    void load(idx <= 0 ? "/" : cwd.slice(0, idx + 1));
  };

  const download = async (entry: SftpEntry) => {
    const path = await save({
      title: "İndirilecek konumu seçin",
      defaultPath: entry.name,
    });
    if (!path) return;
    const opId = sftpOpId++;
    setTransfers((list) => [
      ...list,
      { opId, name: entry.name, dir: "down", transferred: 0, total: 0, done: false, error: null },
    ]);
    setStatus(`İndiriliyor: ${entry.name}...`);
    try {
      await invoke("sftp_download", {
        sessionId,
        remote: entry.path,
        local: path,
        opId,
        resume: true,
      });
      setStatus(`İndirildi: ${entry.name}`);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const upload = async () => {
    const picked = await open({ multiple: true });
    const paths = Array.isArray(picked)
      ? picked
      : typeof picked === "string"
        ? [picked]
        : [];
    if (paths.length === 0) return;
    setStatus(`${paths.length} dosya sıraya alındı`);
    for (const path of paths) {
      const name = path.split("/").pop() || path;
      const joined = cwd.endsWith("/") ? `${cwd}${name}` : `${cwd}/${name}`;
      const opId = sftpOpId++;
      setTransfers((list) => [
        ...list,
        { opId, name, dir: "up", transferred: 0, total: 0, done: false, error: null },
      ]);
      setStatus(`Yükleniyor: ${name}...`);
      try {
        await invoke("sftp_upload", {
          sessionId,
          local: path,
          remote: joined,
          opId,
          resume: true,
        });
        setStatus(`Yüklendi: ${name}`);
      } catch (e) {
        setStatus(String(e));
      }
    }
    void load(cwd);
  };

  const mkdir = async () => {
    const name = window.prompt("Yeni dizin adı:");
    if (!name) return;
    const joined = cwd.endsWith("/") ? `${cwd}${name}` : `${cwd}/${name}`;
    try {
      await invoke("sftp_mkdir", { sessionId, path: joined });
      void load(cwd);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const mkfile = async () => {
    const name = window.prompt("Yeni dosya adı:");
    if (!name) return;
    const joined = cwd.endsWith("/") ? `${cwd}${name}` : `${cwd}/${name}`;
    try {
      await invoke("sftp_mkfile", { sessionId, path: joined });
      void load(cwd);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const rename = async (entry: SftpEntry) => {
    const name = window.prompt("Yeni ad:", entry.name);
    if (!name || name === entry.name) return;
    const joined = cwd.endsWith("/") ? `${cwd}${name}` : `${cwd}/${name}`;
    try {
      await invoke("sftp_rename", {
        sessionId,
        from: entry.path,
        to: joined,
      });
      void load(cwd);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const remove = async (entry: SftpEntry) => {
    if (!window.confirm(`${entry.name} silinsin mi?`)) return;
    try {
      await invoke(entry.isDir ? "sftp_rmdir" : "sftp_remove", {
        sessionId,
        path: entry.path,
      });
      void load(cwd);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const segs = cwd.split("/").filter(Boolean);
  const activeCount = transfers.filter((t) => !t.done).length;

  return (
    <div className="sftp-panel">
      <div className="sftp-header">
        <span className="sftp-title">SFTP — {session.title}</span>
        <button
          className="sftp-btn"
          title="Kapat"
          onClick={() => setSftpOpen(false)}
        >
          ×
        </button>
      </div>

      <div className="sftp-bar">
        <button className="sftp-btn" title="Yukarı" onClick={goUp}>
          ⬆
        </button>
        <button className="sftp-btn" title="Yenile" onClick={() => void load(cwd)}>
          ↻
        </button>
        <div className="sftp-cwd">
          <button className="sftp-crumb" onClick={() => void load("/")}>
            /
          </button>
          {segs.map((seg, i) => (
            <span key={i}>
              <span className="sftp-crumb-sep">/</span>
              <button
                className="sftp-crumb"
                onClick={() => void load("/" + segs.slice(0, i + 1).join("/"))}
              >
                {seg}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="sftp-actions">
        <button className="sftp-btn" title="Yeni dizin" onClick={mkdir}>
          📁+
        </button>
        <button className="sftp-btn" title="Yeni dosya" onClick={mkfile}>
          📄+
        </button>
        <button
          className="sftp-btn"
          title="Yükle (dosya seç)"
          onClick={() => void upload()}
        >
          ⬆ Yükle
        </button>
      </div>

      <div className="sftp-list">
        {loading && <div className="sftp-status">Yükleniyor...</div>}
        {!loading && entries.length === 0 && (
          <div className="sftp-status">Boş dizin</div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.path}
            className="sftp-row"
            onDoubleClick={() => {
              if (entry.isDir) void load(entry.path);
            }}
          >
            <span className="sftp-icon">
              {entry.isDir ? "📁" : entry.isSymlink ? "🔗" : "📄"}
            </span>
            <span className="sftp-name" title={entry.path}>
              {entry.name}
            </span>
            <span className="sftp-size">{entry.isDir ? "" : fmtSize(entry.size)}</span>
            <span className="sftp-row-actions">
              {!entry.isDir && (
                <button
                  className="sftp-btn"
                  title="İndir"
                  onClick={() => void download(entry)}
                >
                  ↓
                </button>
              )}
              <button
                className="sftp-btn"
                title="Yeniden adlandır"
                onClick={() => void rename(entry)}
              >
                ✎
              </button>
              <button
                className="sftp-btn"
                title="Sil"
                onClick={() => void remove(entry)}
              >
                🗑
              </button>
            </span>
          </div>
        ))}
      </div>

      {activeCount > 0 && (
        <div className="sftp-transfers">
          {transfers
            .filter((t) => !t.done)
            .map((t) => (
              <div key={t.opId} className="sftp-transfer">
                <span className="sftp-transfer-name">
                  {t.dir === "down" ? "↓" : "↑"} {t.name}
                </span>
                <div className="sftp-progress">
                  <div
                    className="sftp-progress-fill"
                    style={{
                      width:
                        t.total > 0
                          ? `${Math.min(100, (t.transferred / t.total) * 100)}%`
                          : "4%",
                    }}
                  />
                </div>
                <span className="sftp-transfer-info">
                  {t.total > 0
                    ? `${fmtSize(t.transferred)} / ${fmtSize(t.total)}`
                    : fmtSize(t.transferred)}
                </span>
              </div>
            ))}
        </div>
      )}
      {transfers.filter((t) => t.done && t.error).length > 0 && (
        <div className="sftp-transfers">
          {transfers
            .filter((t) => t.done && t.error)
            .map((t) => (
              <div key={t.opId} className="sftp-transfer">
                <span className="sftp-transfer-name">
                  {t.dir === "down" ? "↓" : "↑"} {t.name}
                </span>
                <span className="sftp-transfer-error">{t.error}</span>
              </div>
            ))}
        </div>
      )}

      {status && <div className="sftp-status">{status}</div>}
    </div>
  );
}