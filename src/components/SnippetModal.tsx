import { useState, useEffect } from "react";
import { useSessionStore } from "../store";
import type { Snippet } from "../types";

export default function SnippetModal() {
  const snippetOpen = useSessionStore((s) => s.snippetOpen);
  const setSnippetOpen = useSessionStore((s) => s.setSnippetOpen);
  const saveSnippet = useSessionStore((s) => s.saveSnippet);
  const editingSnippet = useSessionStore((s) => s.editingSnippet);

  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (editingSnippet) {
      setName(editingSnippet.name);
      setCommand(editingSnippet.command);
    } else {
      setName("");
      setCommand("");
    }
    setError("");
  }, [editingSnippet, snippetOpen]);

  if (!snippetOpen) return null;

  const isEditing = editingSnippet !== null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !command.trim()) {
      setError("İsim ve komut zorunludur");
      return;
    }
    const snippet: Snippet = {
      id: editingSnippet?.id ?? null,
      name: name.trim(),
      command: command.trim(),
    };
    void saveSnippet(snippet);
    setSnippetOpen(false);
  }

  function close() {
    setSnippetOpen(false);
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEditing ? "Snippet Düzenle" : "Yeni Snippet"}</h2>
        <form onSubmit={submit}>
          <label>
            İsim
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ör. Güncelle"
              autoFocus
            />
          </label>
          <label>
            Komut
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="git pull && npm run build"
              rows={5}
              style={{ resize: "vertical" }}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={close}>
              İptal
            </button>
            <button type="submit" className="btn primary">
              {isEditing ? "Güncelle" : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
