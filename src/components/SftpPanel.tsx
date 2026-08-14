import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSessionStore } from "../store";
import type { SftpEntry } from "../types";

function fmtSize(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function bytesToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export default function SftpPanel() {
  const sessionId = useSessionStore((s) => s.sftpSessionId);
  const setSftpOpen = useSessionStore((s) => s.setSftpOpen);
  const sessions = useSessionStore((s) => s.sessions);
  const [cwd, setCwd] = useState("/");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const session = sessions.find((x) => x.id === sessionId);

  const load = useCallback(
    async (path: string) => {
      if (sessionId == null) return;
      setLoading(true);
      setStatus("");
      try {
        const list = await invoke<SftpEntry[]>("sftp_list", {
          sessionId,
          path,
        });
        setEntries(list);
        setCwd(path);
      } catch (e) {
        setStatus(String(e));
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (sessionId != null) void load("/");
  }, [sessionId, load]);

  useEffect(() => {
    if (sessionId == null || session) return;
    setSftpOpen(false);
  }, [sessions, sessionId, session, setSftpOpen]);

  if (sessionId == null || !session) return null;

  const goUp = () => {
    const idx = cwd.lastIndexOf("/", cwd.length - 2);
    void load(idx <= 0 ? "/" : cwd.slice(0, idx + 1));
  };

  const download = async (entry: SftpEntry) => {
    try {
      setStatus(`İndiriliyor: ${entry.name}...`);
      const b64 = await invoke<string>("sftp_read_bytes", {
        sessionId,
        remote: entry.path,
      });
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(`İndirildi: ${entry.name}`);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const upload = async (file: File) => {
    try {
      const data = bytesToB64(await file.arrayBuffer());
      setStatus(`Yükleniyor: ${file.name}...`);
      const joined = cwd.endsWith("/") ? `${cwd}${file.name}` : `${cwd}/${file.name}`;
      const n = await invoke<number>("sftp_write_bytes", {
        sessionId,
        remote: joined,
        dataB64: data,
      });
      setStatus(`Yüklendi: ${file.name} (${fmtSize(n)})`);
      void load(cwd);
    } catch (e) {
      setStatus(String(e));
    }
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

  return (
    <div className="sftp-panel">
      <div className="sftp-header">
        <span className="sftp-title">
          SFTP — {session.title}
        </span>
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
                onClick={() =>
                  void load("/" + segs.slice(0, i + 1).join("/"))
                }
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
          title="Yükle"
          onClick={() => fileInputRef.current?.click()}
        >
          ⬆ Yükle
        </button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
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
                <button className="sftp-btn" title="İndir" onClick={() => void download(entry)}>
                  ↓
                </button>
              )}
              <button className="sftp-btn" title="Yeniden adlandır" onClick={() => void rename(entry)}>
                ✎
              </button>
              <button className="sftp-btn" title="Sil" onClick={() => void remove(entry)}>
                🗑
              </button>
            </span>
          </div>
        ))}
      </div>

      {status && <div className="sftp-status">{status}</div>}
    </div>
  );
}