import { useEffect, useState } from "react";
import { useSessionStore } from "../store";
import type { HostRecord } from "../types";

export default function Sidebar() {
  const hosts = useSessionStore((s) => s.hosts);
  const snippets = useSessionStore((s) => s.snippets);
  const loadHosts = useSessionStore((s) => s.loadHosts);
  const loadSnippets = useSessionStore((s) => s.loadSnippets);
  const deleteHost = useSessionStore((s) => s.deleteHost);
  const deleteSnippet = useSessionStore((s) => s.deleteSnippet);
  const connectToHost = useSessionStore((s) => s.connectToHost);
  const setConnectOpen = useSessionStore((s) => s.setConnectOpen);
  const setSnippetOpen = useSessionStore((s) => s.setSnippetOpen);
  const runSnippet = useSessionStore((s) => s.runSnippet);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void loadHosts();
    void loadSnippets();
  }, []);

  const filtered = hosts.filter(
    (h) =>
      h.name.toLowerCase().includes(query.toLowerCase()) ||
      h.host.toLowerCase().includes(query.toLowerCase()) ||
      h.username.toLowerCase().includes(query.toLowerCase()),
  );

  const groups = new Map<string, HostRecord[]>();
  for (const h of filtered) {
    const g = h.groupName || "Genel";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(h);
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span>Hostlar</span>
        <button
          className="sidebar-add"
          title="Yeni host ekle"
          onClick={() => setConnectOpen(true)}
        >
          +
        </button>
      </div>
      <input
        className="sidebar-search"
        placeholder="Ara..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="sidebar-list">
        {[...groups.entries()].map(([group, items]) => (
          <div key={group} className="host-group">
            <div className="host-group-title">{group}</div>
            {items.map((h) => (
              <div key={h.id} className="host-item" onClick={() => connectToHost(h)}>
                <span className="host-item-icon">🖥</span>
                <span className="host-item-body">
                  <span className="host-item-name">{h.name}</span>
                  <span className="host-item-sub">
                    {h.username}@{h.host}:{h.port}
                  </span>
                </span>
                <button
                  className="host-item-del"
                  title="Sil"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (h.id != null) void deleteHost(h.id);
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
              ? "Kayıtlı host yok. SSH Bağlan ile kaydedebilirsiniz."
              : "Sonuç yok"}
          </div>
        )}
      </div>
      <div className="sidebar-snippets">
        <div className="sidebar-header">
          <span>Snippetler</span>
          <button
            className="sidebar-add"
            title="Yeni snippet ekle"
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
                className="host-item-del"
                title="Sil"
                onClick={(e) => {
                  e.stopPropagation();
                  if (sn.id != null) void deleteSnippet(sn.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
          {snippets.length === 0 && (
            <div className="sidebar-empty">Henüz snippet yok. + ile ekleyebilirsiniz.</div>
          )}
        </div>
      </div>
    </div>
  );
}