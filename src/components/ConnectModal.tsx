import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSessionStore } from "../store";
import { t } from "../i18n";
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
  const [startupCommand, setStartupCommand] = useState("");
  const [error, setError] = useState("");
  const [keygenOpen, setKeygenOpen] = useState(false);
  const [keygenPath, setKeygenPath] = useState("~/.ssh/id_ed25519");
  const [keygenPass, setKeygenPass] = useState("");
  const [keygenMsg, setKeygenMsg] = useState("");
  const [keygenErr, setKeygenErr] = useState("");

  const generateKey = async () => {
    setKeygenMsg("");
    setKeygenErr("");
    try {
      const p = await invoke<string>("ssh_keygen", {
        path: keygenPath,
        passphrase: keygenPass || null,
        comment: null,
      });
      setKeyPath(p);
      setKeygenMsg(`Anahtar oluşturuldu: ${p}`);
    } catch (e) {
      setKeygenErr(String(e instanceof Error ? e.message : e));
    }
  };

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
      setStartupCommand(editingHost.startupCommand ?? "");
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
      setStartupCommand("");
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
      setError(t("connect.required"));
      return;
    }
    let auth: SshAuth;
    if (authMethod === "password") {
      auth = { method: "password", password };
    } else if (authMethod === "key") {
      if (!keyPath.trim()) {
        setError(t("connect.keyRequired"));
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
        startupCommand: startupCommand.trim() || null,
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
        startupCommand: startupCommand.trim() || null,
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
      startupCommand: startupCommand.trim() || null,
    });
    close();
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editingHost ? t("connect.editTitle") : t("connect.title")}</h2>
        <form onSubmit={submit}>
          <label>
            {t("connect.host")}
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder={t("connect.hostPh")}
              autoFocus
            />
          </label>
          <div className="row2">
            <label>
              {t("connect.port")}
              <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="22" />
            </label>
            <label>
              {t("connect.user")}
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="root"
              />
            </label>
          </div>
          <label>
            {t("connect.auth")}
            <select
              value={authMethod}
              onChange={(e) => setAuthMethod(e.target.value as typeof authMethod)}
            >
              <option value="password">{t("connect.auth.password")}</option>
              <option value="key">{t("connect.auth.key")}</option>
              <option value="agent">{t("connect.auth.agent")}</option>
            </select>
          </label>
          {authMethod === "password" && (
            <label>
              {t("connect.password")}
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editingHost ? t("connect.passwordPh") : "••••••••"}
              />
            </label>
          )}
          {authMethod === "key" && (
            <>
              <label>
                {t("connect.keyPath")}
                <input
                  value={keyPath}
                  onChange={(e) => setKeyPath(e.target.value)}
                  placeholder="~/.ssh/id_ed25519"
                />
              </label>
              <label>
                {t("connect.keyPass")}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="••••••••"
                />
              </label>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setKeygenOpen(!keygenOpen)}
              >
                {t("connect.genKey")}
              </button>
              {keygenOpen && (
                <div className="keygen-box">
                  <label>
                    {t("connect.genKeyPath")}
                    <input
                      value={keygenPath}
                      onChange={(e) => setKeygenPath(e.target.value)}
                      placeholder="~/.ssh/id_ed25519"
                    />
                  </label>
                  <label>
                    {t("connect.genKeyPass")}
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={keygenPass}
                      onChange={(e) => setKeygenPass(e.target.value)}
                      placeholder="••••••••"
                    />
                  </label>
                  <div className="row2">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void generateKey()}
                    >
                      {t("connect.generate")}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setKeygenOpen(false)}
                    >
                      {t("settings.cancel")}
                    </button>
                  </div>
                  {keygenMsg && <p className="settings-ok">{keygenMsg}</p>}
                  {keygenErr && <p className="form-error">{keygenErr}</p>}
                </div>
              )}
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
              {t("connect.jump")}
            </label>
            {jumpEnabled && (
              <>
                <div className="row2">
                  <label>
                    {t("connect.jumpHost")}
                    <input
                      value={jumpHost}
                      onChange={(e) => setJumpHost(e.target.value)}
                      placeholder="bastion.sunucu.com"
                    />
                  </label>
                  <label>
                    {t("connect.jumpPort")}
                    <input
                      value={jumpPort}
                      onChange={(e) => setJumpPort(e.target.value)}
                      placeholder="22"
                    />
                  </label>
                </div>
                <div className="row2">
                  <label>
                    {t("connect.jumpUser")}
                    <input
                      value={jumpUser}
                      onChange={(e) => setJumpUser(e.target.value)}
                      placeholder="root"
                    />
                  </label>
                  <label>
                    {t("connect.jumpPass")}
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
                {t("connect.saveHost")}
              </label>
            )}
            {(saveIt || editingHost) && (
              <>
                <label>
                  {t("connect.name")}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={`${username || "kullanıcı"}@${host || "sunucu"}`}
                  />
                </label>
                <label>
                  {t("connect.group")}
                  <input
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    placeholder="ör. Sunucular"
                  />
                </label>
                <label>
                  {t("connect.tags")}
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="ör. prod, web"
                  />
                </label>
                <label>
                  {t("connect.startup")}
                  <textarea
                    value={startupCommand}
                    onChange={(e) => setStartupCommand(e.target.value)}
                    placeholder={t("connect.startupPh")}
                    rows={2}
                    style={{ resize: "vertical" }}
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
              {editingHost ? t("connect.save") : t("connect.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}