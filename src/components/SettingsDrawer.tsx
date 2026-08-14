import { useRef, useState } from "react";
import { useSessionStore } from "../store";
import { THEMES } from "../themes";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [dataMsg, setDataMsg] = useState("");
  const [dataError, setDataError] = useState("");

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
          <h2>Ayarlar</h2>
          <button className="modal-close" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="drawer-body">
          <div className="settings-section">Görünüm</div>
          <div className="settings-grid">
            <label>
              Font ailesi
              <input
                value={settings.fontFamily}
                onChange={(e) => update("fontFamily", e.target.value)}
                placeholder='"JetBrains Mono", monospace'
              />
            </label>
            <div className="row2">
              <label>
                Font boyutu
                <input
                  type="number"
                  min={8}
                  max={32}
                  value={settings.fontSize}
                  onChange={(e) => update("fontSize", Number(e.target.value))}
                />
              </label>
              <label>
                Satır yüksekliği
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
              Scrollback (satır)
              <input
                type="number"
                min={1000}
                step={1000}
                value={settings.scrollback}
                onChange={(e) => update("scrollback", Number(e.target.value))}
              />
            </label>
          </div>

          <div className="settings-section">Tema</div>
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

          <div className="settings-section">SSH</div>
          <div className="settings-grid">
            <label>
              Keepalive (saniye) — yeni bağlantılara uygulanır
              <input
                type="number"
                min={5}
                max={600}
                value={settings.keepaliveSecs}
                onChange={(e) => update("keepaliveSecs", Number(e.target.value))}
              />
            </label>
            <label>
              Zil
              <select
                value={settings.bellStyle}
                onChange={(e) => update("bellStyle", e.target.value)}
              >
                <option value="none">Yok</option>
                <option value="sound">Ses</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.confirmMultilinePaste}
                onChange={(e) => update("confirmMultilinePaste", e.target.checked)}
              />
              Çok satırlı yapıştırmada onay sor
            </label>
          </div>

          <div className="settings-section">Uygulama kilidi</div>
          <div className="settings-grid">
            <p className="settings-hint">
              Kilit, başlangıçta ve 🔒 butonuyla etkinleşir; tüm kayıtlı
              bağlantıları gizler.
            </p>
            {lockMode === "idle" && (
              <div className="row2">
                {!lockEnabled ? (
                  <button className="btn-primary" onClick={() => setLockMode("setup")}>
                    Parola belirle
                  </button>
                ) : (
                  <>
                    <button className="btn-primary" onClick={() => setLockMode("change")}>
                      Parolayı değiştir
                    </button>
                    <button className="btn-danger" onClick={() => setLockMode("remove")}>
                      Kilidi kaldır
                    </button>
                  </>
                )}
              </div>
            )}
            {lockMode !== "idle" && (
              <div className="lock-form">
                {lockMode === "change" || lockMode === "remove" ? (
                  <label>
                    Mevcut parola
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
                    Yeni parola
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
                    Kaydet
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
                    Vazgeç
                  </button>
                </div>
              </div>
            )}
            {lockMsg && <p className="settings-ok">{lockMsg}</p>}
            {lockError && <p className="form-error">{lockError}</p>}
          </div>

          <div className="settings-section">Veri</div>
          <div className="settings-grid">
            <div className="row2">
              <button className="btn-primary" onClick={() => void doExport()}>
                Hostları dışa aktar
              </button>
              <button className="btn-primary" onClick={() => fileRef.current?.click()}>
                JSON içe aktar
              </button>
            </div>
            <button className="btn-secondary" onClick={() => void doSshConfig()}>
              ~/.ssh/config'den host içe aktar
            </button>
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
        </div>
      </div>
    </div>
  );
}