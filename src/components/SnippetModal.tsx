import { useState } from "react";
import { useSessionStore } from "../store";

export default function SnippetModal() {
  const snippetOpen = useSessionStore((s) => s.snippetOpen);
  const setSnippetOpen = useSessionStore((s) => s.setSnippetOpen);
  const saveSnippet = useSessionStore((s) => s.saveSnippet);

  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [error, setError] = useState("");

  if (!snippetOpen) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !command.trim()) {
      setError("İsim ve komut zorunludur");
      return;
    }
    void saveSnippet({ id: null, name: name.trim(), command: command.trim() });
    setSnippetOpen(false);
    setName("");
    setCommand("");
    setError("");
  }

  return (
    <div className="modal-backdrop" onClick={() => setSnippetOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Yeni Snippet</h2>
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
            <button type="button" className="btn" onClick={() => setSnippetOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn primary">
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
