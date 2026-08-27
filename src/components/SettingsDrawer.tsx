import { useRef, useState } from "react";
import { useSessionStore } from "../store";
import { THEMES } from "../themes";
import { t } from "../i18n";

export default function SettingsDrawer() {
  const open = useSessionStore((s) => s.settingsOpen);
  const setOpen = useSessionStore((s) => s.setSettingsOpen);
  const settings = useSessionStore((s) => s.settings);
  const update = useSessionStore((s) => s.updateSetting);
  const themeId = useSessionStore((s) => s.themeId);
  const setTheme = useSessionStore((s) => s.setTheme);
  const lockEnabled = useSessionStore((s) => s.lockEnabled);
  const lockSetup = useSessionStore((s) => s.lockSetup);
  const lockClear = useSessionStore((s) => s.lockClear);
  const exportHosts = useSessionStore((s) => s.exportHosts);
  const importHosts = useSessionStore((s) => s.importHosts);
  const importSshConfig = useSessionStore((s) => s.importSshConfig);
  const exportSshConfig = useSessionStore((s) => s.exportSshConfig);
  const exportSnippets = useSessionStore((s) => s.exportSnippets);
  const importSnippets = useSessionStore((s) => s.importSnippets);
  const checkForUpdates = useSessionStore((s) => s.checkForUpdates);
  const downloadAndInstall = useSessionStore((s) => s.downloadAndInstall);
  const updateAvailable = useSessionStore((s) => s.updateAvailable);
  const updateChecking = useSessionStore((s) => s.updateChecking);
  const [updateMsg, setUpdateMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [dataMsg, setDataMsg] = useState("");
  const [dataError, setDataError] = useState("");
  const snippetFileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setDataMsg("");
    setDataError("");
    try {
      const json = await exportHosts();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "umayterm-hosts-backup.json";
      a.click();
      URL.revokeObjectURL(url);
      setDataMsg("Yedek dosyası indirildi (şifreler dahil edilmez)");
    } catch (e) {
      setDataError(String(e instanceof Error ? e.message : e));
    }
  };

  const onImportFile = async (file: File | null) => {
    setDataMsg("");
    setDataError("");
    if (!file) return;
    try {
      const text = await file.text();
      const n = await importHosts(text);
      setDataMsg(`${n} host içe aktarıldı`);
    } catch (e) {
      setDataError(String(e instanceof Error ? e.message : e));
    }
  };

  const doSshConfig = async () => {
    setDataMsg("");
    setDataError("");
    try {
      const n = await importSshConfig();
      setDataMsg(`${n} host ~/.ssh/config'den içe aktarıldı`);
    } catch (e) {
      setDataError(String(e instanceof Error ? e.message : e));
    }
  };

  const doExportSshConfig = async () => {
    setDataMsg("");
    setDataError("");
    try {
      const path = await exportSshConfig();
      setDataMsg(`Dışa aktarıldı: ${path}`);
    } catch (e) {
      setDataError(String(e instanceof Error ? e.message : e));
    }
  };

  const doExportSnippets = async () => {
    setDataMsg("");
    setDataError("");
    try {
      const json = await exportSnippets();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "umayterm-snippets.json";
      a.click();
      URL.revokeObjectURL(url);
      setDataMsg("Snippet yedeği indirildi");
    } catch (e) {
      setDataError(String(e instanceof Error ? e.message : e));
    }
  };

  const onImportSnippets = async (file: File | null) => {
    setDataMsg("");
    setDataError("");
    if (!file) return;
    try {
      const text = await file.text();
      const n = await importSnippets(text);
      setDataMsg(`${n} snippet içe aktarıldı`);
    } catch (e) {
      setDataError(String(e instanceof Error ? e.message : e));
    }
  };

  const doCheckUpdates = async () => {
    setUpdateMsg("");
    await checkForUpdates();
    if (useSessionStore.getState().updateAvailable) {
      setUpdateMsg(
        `Sürüm ${useSessionStore.getState().updateAvailable!.version} mevcut`,
      );
    } else {
      setUpdateMsg("Güncelleme yok");
    }
  };
  const [lockMode, setLockMode] = useState<"idle" | "setup" | "change" | "remove">(
    "idle",
  );
  const [lockCurrent, setLockCurrent] = useState("");
  const [lockNew, setLockNew] = useState("");
  const [lockMsg, setLockMsg] = useState("");
  const [lockError, setLockError] = useState("");

  const submitLock = async () => {
    setLockMsg("");
    setLockError("");
    try {
      if (lockMode === "remove") {
        await lockClear(lockCurrent);
        setLockMsg("Kilit kaldırıldı");
      } else {
        await lockSetup(lockMode === "change" ? lockCurrent : null, lockNew);
        setLockMsg(lockMode === "setup" ? "Parola tanımlandı" : "Parola değiştirildi");
      }
      setLockMode("idle");
      setLockCurrent("");
      setLockNew("");
    } catch (e) {
      setLockError(String(e instanceof Error ? e.message : e));
    }
  };

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={() => setOpen(false)}>
      <div className="drawer drawer-right" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>{t("settings.title")}</h2>
          <button className="modal-close" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="drawer-body">
          <div className="settings-section">{t("settings.appearance")}</div>
          <div className="settings-grid">
            <label>
              {t("settings.fontFamily")}
              <input
                value={settings.fontFamily}
                onChange={(e) => update("fontFamily", e.target.value)}
                placeholder='"JetBrains Mono", monospace'
              />
            </label>
            <div className="row2">
              <label>
                {t("settings.fontSize")}
                <input
                  type="number"
                  min={8}
                  max={32}
                  value={settings.fontSize}
                  onChange={(e) => update("fontSize", Number(e.target.value))}
                />
              </label>
              <label>
                {t("settings.lineHeight")}
                <input
                  type="number"
                  min={0.8}
                  max={2}
                  step={0.05}
                  value={settings.lineHeight}
                  onChange={(e) => update("lineHeight", Number(e.target.value))}
                />
              </label>
            </div>
            <label>
              {t("settings.scrollback")}
              <input
                type="number"
                min={1000}
                step={1000}
                value={settings.scrollback}
                onChange={(e) => update("scrollback", Number(e.target.value))}
              />
            </label>
            <label>
              {t("settings.accent")}
              <div className="accent-row">
                {["#22d3ee", "#3b82f6", "#a855f7", "#ec4899", "#22c55e", "#f59e0b", "#ef4444"].map((c) => (
                  <button
                    key={c}
                    className={`accent-swatch ${settings.accentColor === c ? "active" : ""}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => update("accentColor", c)}
                  />
                ))}
                <label className="accent-custom" title="Özel renk seç">
                  <input
                    type="color"
                    value={settings.accentColor}
                    onChange={(e) => update("accentColor", e.target.value)}
                  />
                </label>
              </div>
            </label>
          </div>

          <div className="settings-section">{t("settings.theme")}</div>
          <div className="sidebar-themes-list">
            {Object.values(THEMES).map((t) => (
              <button
                key={t.id}
                className={`theme-item ${t.id === themeId ? "active" : ""}`}
                title={t.name}
                onClick={() => setTheme(t.id)}
              >
                <span
                  className="theme-swatch"
                  style={{ background: t.bg, borderColor: t.fg }}
                />
                <span className="theme-name">{t.name}</span>
              </button>
            ))}
          </div>

          <div className="settings-section">Dil / Language</div>
          <div className="settings-grid">
            <label>
              {t("settings.language")}
              <select
                value={settings.language}
                onChange={(e) => update("language", e.target.value)}
              >
                <option value="tr">{t("settings.lang.tr")}</option>
                <option value="en">{t("settings.lang.en")}</option>
              </select>
            </label>
          </div>

          <div className="settings-section">{t("settings.ssh")}</div>
          <div className="settings-grid">
            <label>
              {t("settings.keepalive")}
              <input
                type="number"
                min={5}
                max={600}
                value={settings.keepaliveSecs}
                onChange={(e) => update("keepaliveSecs", Number(e.target.value))}
              />
            </label>
            <label>
              {t("settings.bell")}
              <select
                value={settings.bellStyle}
                onChange={(e) => update("bellStyle", e.target.value)}
              >
                <option value="none">{t("settings.bell.none")}</option>
                <option value="sound">{t("settings.bell.sound")}</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.confirmMultilinePaste}
                onChange={(e) => update("confirmMultilinePaste", e.target.checked)}
              />
              {t("settings.pasteConfirm")}
            </label>
          </div>

          <div className="settings-section">{t("settings.lock")}</div>
          <div className="settings-grid">
            <p className="settings-hint">
              {t("settings.lockHint")}
            </p>
            {lockMode === "idle" && (
              <div className="row2">
                {!lockEnabled ? (
                  <button className="btn-primary" onClick={() => setLockMode("setup")}>
                    {t("settings.lock.set")}
                  </button>
                ) : (
                  <>
                    <button className="btn-primary" onClick={() => setLockMode("change")}>
                      {t("settings.lock.change")}
                    </button>
                    <button className="btn-danger" onClick={() => setLockMode("remove")}>
                      {t("settings.lock.remove")}
                    </button>
                  </>
                )}
              </div>
            )}
            {lockMode !== "idle" && (
              <div className="lock-form">
                {lockMode === "change" || lockMode === "remove" ? (
                  <label>
                    {t("settings.lock.current")}
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={lockCurrent}
                      onChange={(e) => setLockCurrent(e.target.value)}
                    />
                  </label>
                ) : null}
                {lockMode !== "remove" && (
                  <label>
                    {t("settings.lock.new")}
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={lockNew}
                      onChange={(e) => setLockNew(e.target.value)}
                    />
                  </label>
                )}
                <div className="row2">
                  <button className="btn-primary" onClick={submitLock}>
                    {t("settings.save")}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setLockMode("idle");
                      setLockCurrent("");
                      setLockNew("");
                      setLockError("");
                    }}
                  >
                    {t("settings.cancel")}
                  </button>
                </div>
              </div>
            )}
            {lockMsg && <p className="settings-ok">{lockMsg}</p>}
            {lockError && <p className="form-error">{lockError}</p>}
          </div>

          <div className="settings-section">{t("settings.data")}</div>
          <div className="settings-grid">
            <div className="row2">
              <button className="btn-primary" onClick={() => void doExport()}>
                {t("settings.exportHosts")}
              </button>
              <button className="btn-primary" onClick={() => fileRef.current?.click()}>
                {t("settings.importJson")}
              </button>
            </div>
            <button className="btn-secondary" onClick={() => void doSshConfig()}>
              {t("settings.importSshConfig")}
            </button>
            <button className="btn-secondary" onClick={() => void doExportSshConfig()}>
              {t("settings.exportSshConfig")}
            </button>
            <div className="row2">
              <button className="btn-secondary" onClick={() => void doExportSnippets()}>
                {t("settings.exportSnippets")}
              </button>
              <button
                className="btn-secondary"
                onClick={() => snippetFileRef.current?.click()}
              >
                {t("settings.importSnippets")}
              </button>
            </div>
            <input
              ref={snippetFileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                void onImportSnippets(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                void onImportFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            {dataMsg && <p className="settings-ok">{dataMsg}</p>}
            {dataError && <p className="form-error">{dataError}</p>}
          </div>

          <div className="settings-section">{t("settings.update")}</div>
          <div className="settings-grid">
            <p className="settings-hint">
              {t("settings.updateHint")}
            </p>
            {updateAvailable ? (
              <div className="row2">
                <button
                  className="btn-primary"
                  disabled={updateChecking}
                  onClick={() => void downloadAndInstall()}
                >
                  {t("settings.install", { version: updateAvailable.version })}
                </button>
                <button className="btn-secondary" onClick={() => void doCheckUpdates()}>
                  {t("settings.recheck")}
                </button>
              </div>
            ) : (
              <button
                className="btn-secondary"
                disabled={updateChecking}
                onClick={() => void doCheckUpdates()}
              >
                {updateChecking ? t("settings.checking") : t("settings.checkUpdate")}
              </button>
            )}
            {updateMsg && <p className="settings-ok">{updateMsg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}