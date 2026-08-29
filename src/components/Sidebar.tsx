import { useEffect, useState } from "react";
import { useSessionStore } from "../store";
import { t } from "../i18n";
import { writeClipboard } from "../clipboard";
import type { HostRecord } from "../types";

export default function Sidebar() {
  const hosts = useSessionStore((s) => s.hosts);
  const snippets = useSessionStore((s) => s.snippets);
  const sessions = useSessionStore((s) => s.sessions);
  const loadHosts = useSessionStore((s) => s.loadHosts);
  const loadSnippets = useSessionStore((s) => s.loadSnippets);
  const deleteHost = useSessionStore((s) => s.deleteHost);
  const deleteSnippet = useSessionStore((s) => s.deleteSnippet);
  const connectToHost = useSessionStore((s) => s.connectToHost);
  const startEditHost = useSessionStore((s) => s.startEditHost);
  const setConnectOpen = useSessionStore((s) => s.setConnectOpen);
  const setSnippetOpen = useSessionStore((s) => s.setSnippetOpen);
  const setEditingSnippet = useSessionStore((s) => s.setEditingSnippet);
  const setSftpOpen = useSessionStore((s) => s.setSftpOpen);
  const setTunnelsOpen = useSessionStore((s) => s.setTunnelsOpen);
  const runSnippet = useSessionStore((s) => s.runSnippet);
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ type: "host" | "snippet"; id: number; name: string } | null>(null);
  const [hostMenu, setHostMenu] = useState<{ host: HostRecord; x: number; y: number } | null>(null);

  useEffect(() => {
    void loadHosts();
    void loadSnippets();
  }, []);

  useEffect(() => {
    if (!hostMenu) return;
    const close = () => setHostMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [hostMenu]);

  const sessionForHost = (h: HostRecord) =>
    sessions.find(
      (s) =>
        s.kind === "ssh" &&
        s.params.host === h.host &&
        s.params.username === h.username &&
        s.params.port === h.port,
    );

  const copySshCommand = (h: HostRecord) => {
    const cmd = `ssh -p ${h.port} ${h.username}@${h.host}`;
    writeClipboard(cmd);
  };

  const openHostMenu = (e: React.MouseEvent, h: HostRecord) => {
    e.preventDefault();
    e.stopPropagation();
    setHostMenu({ host: h, x: e.clientX, y: e.clientY });
  };

  const q = query.toLowerCase();
  const filtered = hosts.filter(
    (h) =>
      h.name.toLowerCase().includes(q) ||
      h.host.toLowerCase().includes(q) ||
      h.username.toLowerCase().includes(q) ||
      h.tags.toLowerCase().includes(q),
  );

  const groups = new Map<string, HostRecord[]>();
  for (const h of filtered) {
    const g = h.groupName || "Genel";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(h);
  }

  function doDelete() {
    if (!confirmDelete) return;
    if (confirmDelete.type === "host") {
      void deleteHost(confirmDelete.id);
    } else {
      void deleteSnippet(confirmDelete.id);
    }
    setConfirmDelete(null);
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span>{t("hosts")}</span>
        <button
          className="sidebar-add"
          title={t("host.add")}
          onClick={() => setConnectOpen(true)}
        >
          +
        </button>
      </div>
      <input
        className="sidebar-search"
        placeholder={t("host.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="sidebar-list">
        {[...groups.entries()].map(([group, items]) => (
          <div key={group} className="host-group">
            <div className="host-group-title">{group}</div>
            {items.map((h) => (
              <div
                key={h.id}
                className="host-item"
                onClick={() => connectToHost(h)}
                onContextMenu={(e) => openHostMenu(e, h)}
              >
                <span className="host-item-icon">🖥</span>
                <span className="host-item-body">
                  <span className="host-item-name">{h.name}</span>
                  <span className="host-item-sub">
                    {h.username}@{h.host}:{h.port}
                    {h.jumpHost ? ` ↪ ${h.jumpUser}@${h.jumpHost}` : ""}
                  </span>
                  {h.tags && (
                    <span className="host-item-tags">
                      {h.tags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .slice(0, 3)
                        .map((t) => (
                          <span key={t} className="host-tag">
                            {t}
                          </span>
                        ))}
                    </span>
                  )}
                </span>
                <button
                  className="host-item-edit"
                  title={t("host.actions")}
                  onClick={(e) => openHostMenu(e, h)}
                >
                  ⋯
                </button>
                <button
                  className="host-item-edit"
                  title={t("host.edit")}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditHost(h);
                  }}
                >
                  ✎
                </button>
                <button
                  className="host-item-del"
                  title={t("host.delete")}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (h.id != null) setConfirmDelete({ type: "host", id: h.id, name: h.name });
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="sidebar-empty">
            {hosts.length === 0
              ? t("host.none")
              : t("host.noResult")}
          </div>
        )}
      </div>
      <div className="sidebar-snippets">
        <div className="sidebar-header">
          <span>{t("snippets")}</span>
          <button
            className="sidebar-add"
            title={t("snippet.add")}
            onClick={() => setSnippetOpen(true)}
          >
            +
          </button>
        </div>
        <div className="snippet-list">
          {snippets.map((sn) => (
            <div
              key={sn.id}
              className="snippet-item"
              title={sn.command}
              onClick={() => runSnippet(sn)}
            >
              <span className="snippet-item-name">{sn.name}</span>
              <span className="snippet-item-cmd">{sn.command}</span>
              <button
                className="host-item-edit"
                title="Düzenle"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingSnippet(sn);
                }}
              >
                ✎
              </button>
              <button
                className="host-item-del"
                title="Sil"
                onClick={(e) => {
                  e.stopPropagation();
                  if (sn.id != null) setConfirmDelete({ type: "snippet", id: sn.id, name: sn.name });
                }}
              >
                ×
              </button>
            </div>
          ))}
          {snippets.length === 0 && (
            <div className="sidebar-empty">{t("snippet.none")}</div>
          )}
        </div>
      </div>
      {hostMenu && (
        <div
          className="term-menu tab-menu"
          style={{ left: hostMenu.x, top: hostMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="term-menu-item"
            onClick={() => {
              connectToHost(hostMenu.host);
              setHostMenu(null);
            }}
          >
            {t("host.connect")}
          </button>
          <button
            className="term-menu-item"
            onClick={() => {
              copySshCommand(hostMenu.host);
              setHostMenu(null);
            }}
          >
            {t("host.copySsh")}
          </button>
          <button
            className="term-menu-item"
            disabled={!sessionForHost(hostMenu.host)}
            title={
              sessionForHost(hostMenu.host)
                ? "SFTP panelini aç"
                : t("host.needSession")
            }
            onClick={() => {
              const s = sessionForHost(hostMenu.host);
              if (s) setSftpOpen(true, s.id);
              setHostMenu(null);
            }}
          >
            {t("host.sftp")}
          </button>
          <button
            className="term-menu-item"
            disabled={!sessionForHost(hostMenu.host)}
            title={
              sessionForHost(hostMenu.host)
                ? "Tünel panelini aç"
                : "Bu host için aktif bağlantı gerekli"
            }
            onClick={() => {
              setTunnelsOpen(true);
              setHostMenu(null);
            }}
          >
            {t("host.tunnel")}
          </button>
          <div className="term-menu-sep" />
          <button
            className="term-menu-item"
            onClick={() => {
              startEditHost(hostMenu.host);
              setHostMenu(null);
            }}
          >
            ✎ Düzenle
          </button>
          <button
            className="term-menu-item"
            onClick={() => {
              if (hostMenu.host.id != null) {
                setConfirmDelete({
                  type: "host",
                  id: hostMenu.host.id,
                  name: hostMenu.host.name,
                });
              }
              setHostMenu(null);
            }}
          >
            × Sil
          </button>
        </div>
      )}
      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal modal-small" onClick={(e) => e.stopPropagation()}>
            <h2>{t("delete.confirmTitle")}</h2>
            <p>
              <strong>{confirmDelete.name}</strong> {t("delete.confirmText")}
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmDelete(null)}>
                {t("delete.cancel")}
              </button>
              <button className="btn danger" onClick={doDelete}>
                {t("delete.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}