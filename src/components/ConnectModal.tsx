import { useState } from "react";
import { useSessionStore } from "../store";
import type { HostRecord, SshAuth } from "../types";

export default function ConnectModal() {
  const connectOpen = useSessionStore((s) => s.connectOpen);
  const setConnectOpen = useSessionStore((s) => s.setConnectOpen);
  const openSsh = useSessionStore((s) => s.openSsh);
  const saveHost = useSessionStore((s) => s.saveHost);

  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authMethod, setAuthMethod] = useState<"password" | "key" | "agent">("password");
  const [password, setPassword] = useState("");
  const [keyPath, setKeyPath] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [name, setName] = useState("");
  const [saveIt, setSaveIt] = useState(false);
  const [group, setGroup] = useState("");
  const [error, setError] = useState("");

  if (!connectOpen) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim() || !username.trim()) {
      setError("Adres ve kullanıcı adı zorunludur");
      return;
    }
    let auth: SshAuth;
    if (authMethod === "password") {
      auth = { method: "password", password };
    } else if (authMethod === "key") {
      if (!keyPath.trim()) {
        setError("Anahtar dosyası yolu gerekli");
        return;
      }
      auth = {
        method: "key",
        key_path: keyPath.trim(),
        passphrase: passphrase || null,
      };
    } else {
      auth = { method: "agent" };
    }

    if (saveIt) {
      const record: HostRecord = {
        id: null,
        name: name.trim() || username.trim() + "@" + host.trim(),
        host: host.trim(),
        port: parseInt(port, 10) || 22,
        username: username.trim(),
        authMethod,
        keyPath: authMethod === "key" ? keyPath.trim() : null,
        password: authMethod === "password" ? password : null,
        passphrase: authMethod === "key" ? passphrase || null : null,
        groupName: group.trim(),
        tags: "",
      };
      void saveHost(record);
    }

    openSsh({
      host: host.trim(),
      port: parseInt(port, 10) || 22,
      username: username.trim(),
      auth,
    });
    setConnectOpen(false);
  }

  return (
    <div className="modal-backdrop" onClick={() => setConnectOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>SSH Bağlantısı</h2>
        <form onSubmit={submit}>
          <label>
            Adres
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="ör. 192.168.1.10 veya sunucu.com"
              autoFocus
            />
          </label>
          <div className="row2">
            <label>
              Port
              <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="22" />
            </label>
            <label>
              Kullanıcı
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="root"
              />
            </label>
          </div>
          <label>
            Kimlik doğrulama
            <select
              value={authMethod}
              onChange={(e) => setAuthMethod(e.target.value as typeof authMethod)}
            >
              <option value="password">Parola</option>
              <option value="key">Anahtar dosyası</option>
              <option value="agent">ssh-agent</option>
            </select>
          </label>
          {authMethod === "password" && (
            <label>
              Parola
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
          )}
          {authMethod === "key" && (
            <>
              <label>
                Anahtar dosyası
                <input
                  value={keyPath}
                  onChange={(e) => setKeyPath(e.target.value)}
                  placeholder="~/.ssh/id_ed25519"
                />
              </label>
              <label>
                Parola (boş olabilir)
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="••••••••"
                />
              </label>
            </>
          )}
          {error && <div className="form-error">{error}</div>}
          <div className="save-box">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={saveIt}
                onChange={(e) => setSaveIt(e.target.checked)}
              />
              Host olarak kaydet
            </label>
            {saveIt && (
              <>
                <label>
                  İsim
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={`${username || "kullanıcı"}@${host || "sunucu"}`}
                  />
                </label>
                <label>
                  Grup (opsiyonel)
                  <input
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    placeholder="ör. Sunucular"
                  />
                </label>
              </>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setConnectOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn primary">
              Bağlan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}