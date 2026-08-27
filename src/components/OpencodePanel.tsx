import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSessionStore } from "../store";
import type { OpencodePart, OpencodeSession } from "../types";

const TOOL_ICONS: Record<string, string> = {
  read: "📖",
  write: "✏️",
  edit: "✏️",
  apply_patch: "🩹",
  bash: "💻",
  grep: "🔍",
  glob: "🗂",
  task: "👥",
  webfetch: "🌐",
  websearch: "🔎",
  todowrite: "☑️",
  lsp: "🧩",
  skill: "🎓",
};

function toolIcon(tool?: string | null): string {
  if (!tool) return "🔧";
  return TOOL_ICONS[tool] ?? "🔧";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds(),
  ).padStart(2, "0")}`;
}

function statusLabel(status?: string | null): string {
  if (!status) return "";
  if (status === "completed") return "✓";
  if (status === "running" || status === "pending") return "⟳";
  if (status === "error") return "✗";
  return status;
}

function PartNode({ part }: { part: OpencodePart }) {
  const [open, setOpen] = useState(false);
  if (part.type === "text") {
    return (
      <div className="oc-part oc-text">
        <span className="oc-part-ts">{fmtTime(part.timeCreated)}</span>
        <span className="oc-text-body">{truncate(part.text ?? "", 240)}</span>
      </div>
    );
  }
  if (part.type === "reasoning") {
    return (
      <div className="oc-part oc-reasoning" onClick={() => setOpen(!open)}>
        <span className="oc-part-ts">{fmtTime(part.timeCreated)}</span>
        <span className="oc-reasoning-label">
          {open ? "▾" : "▸"} 🧠 düşünme
        </span>
        {open && <div className="oc-reasoning-body">{part.text}</div>}
      </div>
    );
  }
  if (part.type === "tool") {
    return (
      <div className="oc-part oc-tool" onClick={() => setOpen(!open)}>
        <span className="oc-part-ts">{fmtTime(part.timeCreated)}</span>
        <span className="oc-tool-icon">{toolIcon(part.tool)}</span>
        <span className="oc-tool-name">{part.tool ?? "tool"}</span>
        <span
          className={`oc-status ${
            part.status === "error"
              ? "error"
              : part.status === "running" || part.status === "pending"
                ? "running"
                : ""
          }`}
        >
          {statusLabel(part.status)}
        </span>
        {open && part.text && <div className="oc-tool-detail">{part.text}</div>}
      </div>
    );
  }
  return null;
}

function MessageNode({ msg }: { msg: { role: string; agent?: string | null; parts: OpencodePart[] } }) {
  return (
    <div className="oc-msg">
      <div className="oc-msg-head">
        <span className={`oc-role oc-role-${msg.role}`}>
          {msg.role === "user" ? "sen" : "assistant"}
        </span>
        {msg.agent && <span className="oc-agent">{msg.agent}</span>}
      </div>
      <div className="oc-parts">
        {msg.parts.map((p) => (
          <PartNode key={p.id} part={p} />
        ))}
      </div>
    </div>
  );
}

function SessionNode({ session, depth }: { session: OpencodeSession; depth: number }) {
  const now = Date.now();
  const active = now - session.timeUpdated < 6000;
  return (
    <div className="oc-session" style={{ marginLeft: depth * 16 }}>
      <div className="oc-session-head">
        <span className="oc-session-icon">{active ? "⟳" : "●"}</span>
        <span className="oc-session-title">
          {session.title || (session.parentId ? "subagent" : "opencode")}
        </span>
        <span className={`oc-badge ${active ? "active" : "idle"}`}>
          {active ? "çalışıyor" : "bekliyor"}
        </span>
      </div>
      {session.directory && (
        <div className="oc-session-dir">{session.directory}</div>
      )}
      <div className="oc-timeline">
        {session.messages.map((m) => (
          <MessageNode
            key={m.id}
            msg={{ role: m.role, agent: m.agent, parts: m.parts }}
          />
        ))}
      </div>
      {session.children.map((c) => (
        <SessionNode key={c.id} session={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function OpencodePanel() {
  const open = useSessionStore((s) => s.opencodeOpen);
  const setOpen = useSessionStore((s) => s.setOpencodeOpen);
  const [data, setData] = useState<OpencodeSession | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const poll = async () => {
      const st = useSessionStore.getState();
      const active = st.sessions.find((x) => x.id === st.activeId);
      const dir =
        active?.kind === "local"
          ? st.tabCwd[active.id] || active.cwd || null
          : null;
      try {
        const res = await invoke<OpencodeSession | null>("opencode_probe", {
          directory: dir,
        });
        if (alive) {
          setData(res);
          setError("");
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    setLoading(true);
    void poll().finally(() => {
      if (alive) setLoading(false);
    });
    const timer = window.setInterval(() => void poll(), 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data]);

  if (!open) return null;

  return (
    <div className="drawer-backdrop">
      <div className="drawer drawer-right oc-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>opencode</h2>
          <button className="modal-close" onClick={() => setOpen(false)} title="Kapat">
            ×
          </button>
        </div>
        <div className="oc-body" ref={listRef}>
          {loading && !data && <div className="oc-empty">Yükleniyor…</div>}
          {error && <div className="ai-error">{error}</div>}
          {!loading && !error && !data && (
            <div className="oc-empty">
              Aktif opencode oturumu bulunamadı. Sekmede{" "}
              <code>opencode</code> çalıştırın (opencode.db taranır).
            </div>
          )}
          {data && <SessionNode session={data} depth={0} />}
        </div>
      </div>
    </div>
  );
}