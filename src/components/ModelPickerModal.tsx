import { useEffect, useMemo, useRef, useState } from "react";
import type { AiModelInfo } from "../types";
import { t } from "../i18n";

export default function ModelPickerModal({
  open,
  models,
  current,
  onSelect,
  onClose,
}: {
  open: boolean;
  models: AiModelInfo[];
  current: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const token = q.trim().toLowerCase();
    const match = (m: AiModelInfo) => {
      if (!token) return true;
      return `${m.id} ${m.name ?? ""}`.toLowerCase().includes(token);
    };
    const sorted = models
      .filter(match)
      .sort((a, b) =>
        `${a.name ?? a.id}`.localeCompare(`${b.name ?? b.id}`, undefined, {
          sensitivity: "base",
        }),
      );
    const idx = sorted.findIndex((m) => m.id === current);
    if (idx > 0) {
      const [cur] = sorted.splice(idx, 1);
      sorted.unshift(cur);
    }
    return sorted;
  }, [models, q, current]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSel(0);
  }, [q, models]);

  if (!open) return null;

  const choose = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <div className="palette-backdrop model-picker-backdrop" onClick={onClose}>
      <div
        className="palette model-picker"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          value={q}
          placeholder={t("ai.modelSearch")}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((v) => Math.min(v + 1, list.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((v) => Math.max(v - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const item = list[sel];
              if (item) choose(item.id);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
        />
        <div className="palette-list model-picker-list">
          {list.length === 0 && (
            <div className="palette-empty">{t("ai.modelEmpty")}</div>
          )}
          {list.map((m, i) => (
            <div
              key={m.id}
              className={`palette-item ${i === sel ? "selected" : ""} ${
                m.id === current ? "current" : ""
              }`}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(m.id)}
            >
              <span className="palette-icon">
                {m.id === current ? "✓" : "🤖"}
              </span>
              <span className="palette-title">{m.name ?? m.id}</span>
              <span className="palette-sub">{m.id}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}