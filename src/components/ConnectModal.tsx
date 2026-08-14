import { useEffect, useState } from "react";
import { useSessionStore } from "../store";
import type { HostRecord, SshAuth } from "../types";

export default function ConnectModal() {
  const connectOpen = useSessionStore((s) => s.connectOpen);
  const setConnectOpen = useSessionStore((s) => s.setConnectOpen);
  const editingHost = useSessionStore((s) => s.editingHost);
  const clearEditHost = useSessionStore((s) => s.clearEditHost);
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
  const [tags, setTags] = useState("");
  const [jumpEnabled, setJumpEnabled] = useState(false);
  const [jumpHost, setJumpHost] = useState("");
  const [jumpPort, setJumpPort] = useState("22");
  const [jumpUser, setJumpUser] = useState("");
  const [jumpPassword, setJumpPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (editingHost) {
      setHost(editingHost.host);
      setPort(String(editingHost.port));
      setUsername(editingHost.username);
      setAuthMethod(
        (editingHost.authMethod as "password" | "key" | "agent") || "password",
      );
      setPassword(editingHost.password ?? "");
      setKeyPath(editingHost.keyPath ?? "");
      setPassphrase(editingHost.passphrase ?? "");
      setName(editingHost.name);
      setSaveIt(true);
      setGroup(editingHost.groupName);
      setTags(editingHost.tags);
      setJumpEnabled(!!editingHost.jumpHost && !!editingHost.jumpUser);
      setJumpHost(editingHost.jumpHost ?? "");
      setJumpPort(String(editingHost.jumpPort ?? 22));
      setJumpUser(editingHost.jumpUser ?? "");
      setJumpPassword(editingHost.jumpPassword ?? "");
    } else if (connectOpen) {
      setHost("");
      setPort("22");
      setUsername("");
      setAuthMethod("password");
      setPassword("");
      setKeyPath("");
      setPassphrase("");
      setName("");
      setSaveIt(false);
      setGroup("");
      setTags("");
      setJumpEnabled(false);
      setJumpHost("");
      setJumpPort("22");
      setJumpUser("");
      setJumpPassword("");
      setError("");
    }
  }, [editingHost, connectOpen]);

  if (!connectOpen) return null;

  function close() {
    setConnectOpen(false);
    clearEditHost();
  }

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

    if (editingHost) {
      const updated: HostRecord = {
        ...editingHost,
        name: name.trim() || username.trim() + "@" + host.trim(),
        host: host.trim(),
        port: parseInt(port, 10) || 22,
        username: username.trim(),
        authMethod,
        keyPath: authMethod === "key" ? keyPath.trim() : null,
        password: authMethod === "password" ? password : null,
        passphrase: authMethod === "key" ? passphrase || null : null,
        groupName: group.trim(),
        tags: tags.trim(),
        jumpHost: jumpEnabled ? jumpHost.trim() : null,
        jumpPort: jumpEnabled ? parseInt(jumpPort, 10) || 22 : null,
        jumpUser: jumpEnabled ? jumpUser.trim() : null,
        jumpPassword: jumpEnabled ? jumpPassword : null,
      };
      void saveHost(updated);
      close();
      return;
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
        tags: tags.trim(),
        jumpHost: jumpEnabled ? jumpHost.trim() : null,
        jumpPort: jumpEnabled ? parseInt(jumpPort, 10) || 22 : null,
        jumpUser: jumpEnabled ? jumpUser.trim() : null,
        jumpPassword: jumpEnabled ? jumpPassword : null,
      };
      void saveHost(record);
    }

    openSsh({
      host: host.trim(),
      port: parseInt(port, 10) || 22,
      username: username.trim(),
      auth,
      jump: jumpEnabled && jumpHost.trim() && jumpUser.trim()
        ? {
            host: jumpHost.trim(),
            port: parseInt(jumpPort, 10) || 22,
            username: jumpUser.trim(),
            auth: { method: "password", password: jumpPassword },
          }
        : null,
    });
    close();
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editingHost ? "Host Düzenle" : "SSH Bağlantısı"}</h2>
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
                placeholder={editingHost ? "Boş bırakılırsa değişmez" : "••••••••"}
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
                checked={jumpEnabled}
                onChange={(e) => setJumpEnabled(e.target.checked)}
              />
              Jump host üzerinden bağlan (ProxyJump)
            </label>
            {jumpEnabled && (
              <>
                <div className="row2">
                  <label>
                    Jump adresi
                    <input
                      value={jumpHost}
                      onChange={(e) => setJumpHost(e.target.value)}
                      placeholder="bastion.sunucu.com"
                    />
                  </label>
                  <label>
                    Jump port
                    <input
                      value={jumpPort}
                      onChange={(e) => setJumpPort(e.target.value)}
                      placeholder="22"
                    />
                  </label>
                </div>
                <div className="row2">
                  <label>
                    Jump kullanıcı
                    <input
                      value={jumpUser}
                      onChange={(e) => setJumpUser(e.target.value)}
                      placeholder="root"
                    />
                  </label>
                  <label>
                    Jump parola
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={jumpPassword}
                      onChange={(e) => setJumpPassword(e.target.value)}
                      placeholder={editingHost ? "Boş bırakılırsa değişmez" : "••••••••"}
                    />
                  </label>
                </div>
              </>
            )}
            {!editingHost && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={saveIt}
                  onChange={(e) => setSaveIt(e.target.checked)}
                />
                Host olarak kaydet
              </label>
            )}
            {(saveIt || editingHost) && (
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
                <label>
                  Etiketler (virgülle ayırın)
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="ör. prod, web"
                  />
                </label>
              </>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={close}>
              İptal
            </button>
            <button type="submit" className="btn primary">
              {editingHost ? "Kaydet" : "Bağlan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}