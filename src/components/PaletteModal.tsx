import { useEffect, useMemo, useRef, useState } from "react";
import { useSessionStore } from "../store";
import { DEV_COMMANDS } from "../devCommands";
import { t } from "../i18n";

interface PaletteItem {
  key: string;
  group: string;
  title: string;
  subtitle?: string;
  icon?: string;
  run: () => void;
}

export default function PaletteModal() {
  const open = useSessionStore((s) => s.paletteOpen);
  const setOpen = useSessionStore((s) => s.setPaletteOpen);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<PaletteItem[]>(() => {
    const st = useSessionStore.getState();
    const token = q.trim().toLowerCase();
    const match = (t: string, s = "") => {
      if (!token) return true;
      return token.split(/\s+/).every((tok) =>
        `${t} ${s}`.toLowerCase().includes(tok),
      );
    };
    const out: PaletteItem[] = [];
    if (match("SSH Bağlan", "yeni bağlantı")) {
      out.push({
        key: "action-connect",
        group: t("palette.group.actions"),
        title: t("palette.newSsh"),
        icon: "🔌",
        run: () => st.setConnectOpen(true),
      });
    }
    if (match("Yeni yerel sekme", "zsh")) {
      out.push({
        key: "action-local",
        group: t("palette.group.actions"),
        title: t("palette.newTab"),
        icon: "▣",
        run: () => st.openLocal(),
      });
    }
    if (match("Ayarlar")) {
      out.push({
        key: "action-settings",
        group: t("palette.group.actions"),
        title: t("palette.settings"),
        icon: "⚙",
        run: () => st.setSettingsOpen(true),
      });
    }
    for (const s of st.sessions) {
      if (match(s.title, s.kind === "ssh" ? s.params.host : "yerel zsh")) {
        out.push({
          key: `tab-${s.id}`,
          group: t("palette.group.tabs"),
          title: s.title,
          subtitle:
            s.kind === "ssh"
              ? `${s.params.username}@${s.params.host}:${s.params.port}`
              : t("palette.newTabSub"),
          icon: s.kind === "ssh" ? "🖥" : "▣",
          run: () => st.activate(s.id),
        });
      }
    }
    for (const h of st.hosts) {
      if (match(h.name, `${h.host} ${h.username}`)) {
        out.push({
          key: `host-${h.id}`,
          group: t("palette.group.hosts"),
          title: h.name,
          subtitle: `${h.username}@${h.host}:${h.port}`,
          icon: "🖥",
          run: () => st.connectToHost(h),
        });
      }
    }
    for (const sn of st.snippets) {
      if (match(sn.name, sn.command)) {
        out.push({
          key: `snip-${sn.id}`,
          group: t("palette.group.snippets"),
          title: sn.name,
          subtitle: sn.command,
          icon: "⚡",
          run: () => st.runSnippet(sn),
        });
      }
    }
    for (const dc of DEV_COMMANDS) {
      if (match(dc.title, dc.subtitle)) {
        out.push({
          key: `dev-${dc.key}`,
          group: t("palette.group.dev"),
          title: dc.title,
          subtitle: dc.subtitle,
          icon: dc.icon,
          run: () => st.runDevCommand(dc.command),
        });
      }
    }
    return out;
  }, [q, open]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSel(0);
  }, [q]);

  if (!open) return null;

  const runItem = (item: PaletteItem) => {
    setOpen(false);
    item.run();
  };

  let lastGroup = "";
  return (
    <div className="modal-backdrop palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          value={q}
          placeholder={t("palette.placeholder")}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((v) => Math.min(v + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((v) => Math.max(v - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const item = items[sel];
              if (item) runItem(item);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <div className="palette-list">
          {items.length === 0 && (
            <div className="palette-empty">{t("palette.empty")}</div>
          )}
          {items.map((item, i) => {
            const header =
              item.group !== lastGroup ? (
                <div key={`g-${item.group}`} className="palette-group">
                  {item.group}
                </div>
              ) : null;
            lastGroup = item.group;
            return (
              <div key={`h-${item.group}`}>
                {header}
                <div
                  className={`palette-item ${i === sel ? "selected" : ""}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => runItem(item)}
                >
                  <span className="palette-icon">{item.icon}</span>
                  <span className="palette-title">{item.title}</span>
                  {item.subtitle && (
                    <span className="palette-sub">{item.subtitle}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}