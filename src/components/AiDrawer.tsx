import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { useSessionStore } from "../store";
import MarkdownView from "./MarkdownView";
import type { AiEvent, AiMessage, AiModelInfo } from "../types";

interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

export default function AiDrawer() {
  const open = useSessionStore((s) => s.aiOpen);
  const setOpen = useSessionStore((s) => s.setAiOpen);
  const aiKeySet = useSessionStore((s) => s.aiKeySet);
  const setAiKeySet = useSessionStore((s) => s.setAiKeySet);
  const aiModel = useSessionStore((s) => s.settings.aiModel);
  const updateSetting = useSessionStore((s) => s.updateSetting);

  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState("");
  const [keySaving, setKeySaving] = useState(false);

  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !aiKeySet) return;
    let alive = true;
    setModelsLoading(true);
    setModelsError("");
    invoke<AiModelInfo[]>("ai_models")
      .then((list) => {
        if (!alive) return;
        setModels(list);
        setModelsLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setModelsError(String(e));
        setModelsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, aiKeySet]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const saveKey = async () => {
    setKeyError("");
    setKeySaving(true);
    try {
      await invoke("ai_key_set", { key: keyInput });
      setAiKeySet(true);
      setKeyInput("");
    } catch (e) {
      setKeyError(String(e));
    } finally {
      setKeySaving(false);
    }
  };

  const removeKey = async () => {
    await invoke("ai_key_clear");
    setAiKeySet(false);
    setModels([]);
    setMessages([]);
    setError("");
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg: ChatMsg = { id: nextId.current++, role: "user", content: text };
    const asstMsg: ChatMsg = { id: nextId.current++, role: "assistant", content: "" };
    const apiMessages: AiMessage[] = [
      ...messages
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text },
    ];
    setMessages((m) => [...m, userMsg, asstMsg]);
    setInput("");
    setBusy(true);
    setError("");
    const channel = new Channel<AiEvent>((ev) => {
      if (ev.type === "chunk") {
        setMessages((ms) =>
          ms.map((m) =>
            m.id === asstMsg.id ? { ...m, content: m.content + ev.content } : m,
          ),
        );
      } else if (ev.type === "done") {
        setBusy(false);
      } else if (ev.type === "error") {
        setError(ev.message);
        setMessages((ms) =>
          ms.map((m) =>
            m.id === asstMsg.id
              ? { ...m, content: m.content || "", error: true }
              : m,
          ),
        );
        setBusy(false);
      }
    });
    try {
      await invoke("ai_chat", {
        model: aiModel,
        messages: apiMessages,
        onEvent: channel,
      });
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const stop = () => {
    void invoke("ai_stop");
    setBusy(false);
  };

  const clear = () => {
    setMessages([]);
    setError("");
  };

  if (!open) return null;

  return (
    <div className="drawer-backdrop">
      <div className="drawer drawer-right ai-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>AI Asistan</h2>
          <button className="modal-close" onClick={() => setOpen(false)} title="Kapat">
            ×
          </button>
        </div>
        {!aiKeySet ? (
          <div className="drawer-body">
            <p className="settings-hint">
              Sohbet için bir OpenRouter API anahtarı girin. Anahtar güvenli
              şekilde (OS keyring) saklanır ve yalnızca bu uygulama içinde
              kullanılır.
            </p>
            <label>
              OpenRouter API anahtarı
              <input
                type="password"
                autoComplete="off"
                value={keyInput}
                autoFocus
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveKey();
                }}
                placeholder="sk-or-v1-…"
              />
            </label>
            <button
              className="btn-primary"
              disabled={keySaving || !keyInput.trim()}
              onClick={() => void saveKey()}
            >
              {keySaving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            {keyError && <p className="form-error">{keyError}</p>}
            <a
              className="ai-external"
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
            >
              Anahtar almak için openrouter.ai/keys ↗
            </a>
          </div>
        ) : (
          <>
            <div className="ai-bar">
              <input
                list="ai-models"
                className="ai-model-input"
                value={aiModel}
                onChange={(e) => updateSetting("aiModel", e.target.value)}
                placeholder="Model seçin veya yazın"
                title="Model (OpenRouter id'si)"
              />
              <datalist id="ai-models">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.id}
                  </option>
                ))}
              </datalist>
              <button
                className="ai-btn"
                disabled={messages.length === 0 || busy}
                onClick={clear}
              >
                Temizle
              </button>
              <button
                className="ai-btn ai-btn-danger"
                title="API anahtarını kaldır"
                onClick={() => void removeKey()}
              >
                Anahtarı kaldır
              </button>
            </div>
            <div className="ai-chat" ref={listRef}>
              {messages.length === 0 && (
                <div className="ai-empty">
                  OpenRouter üzerinden sorunuzu yazın. Model seçebilirsiniz.
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`ai-msg ${m.role} ${m.error ? "error" : ""}`}
                >
                  {m.role === "assistant" ? (
                    m.content ? (
                      <MarkdownView content={m.content} />
                    ) : busy ? (
                      <span className="ai-typing">▊</span>
                    ) : null
                  ) : (
                    m.content
                  )}
                </div>
              ))}
            </div>
            {modelsLoading && (
              <div className="ai-status">Modeller yükleniyor…</div>
            )}
            {modelsError && <div className="ai-error">{modelsError}</div>}
            {error && <div className="ai-error">{error}</div>}
            <div className="ai-input-row">
              <textarea
                className="ai-input"
                rows={2}
                value={input}
                placeholder="Mesaj yazın (Enter: gönder, Shift+Enter: yeni satır)"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {busy ? (
                <button className="ai-btn ai-btn-danger" onClick={stop}>
                  ■ Durdur
                </button>
              ) : (
                <button
                  className="btn-primary"
                  disabled={!input.trim()}
                  onClick={() => void send()}
                >
                  ➤
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}