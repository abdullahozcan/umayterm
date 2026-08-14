import { useEffect, useState } from "react";
import { useSessionStore } from "../store";

export default function TunnelModal() {
  const open = useSessionStore((s) => s.tunnelsOpen);
  const setOpen = useSessionStore((s) => s.setTunnelsOpen);
  const tunnels = useSessionStore((s) => s.tunnels);
  const loadTunnels = useSessionStore((s) => s.loadTunnels);
  const createTunnel = useSessionStore((s) => s.createTunnel);
  const closeTunnel = useSessionStore((s) => s.closeTunnel);
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);

  const [kind, setKind] = useState("local");
  const [listenPort, setListenPort] = useState("8080");
  const [targetHost, setTargetHost] = useState("127.0.0.1");
  const [targetPort, setTargetPort] = useState("80");
  const [error, setError] = useState("");

  const sshSessions = sessions.filter((s) => s.kind === "ssh");
  const [sshId, setSshId] = useState<number | null>(
    sshSessions.some((s) => s.id === activeId) ? activeId : null,
  );

  useEffect(() => {
    if (open) {
      void loadTunnels();
      setError("");
      const st = useSessionStore.getState();
      const ssh = st.sessions.filter((s) => s.kind === "ssh");
      setSshId(ssh.some((s) => s.id === st.activeId) ? st.activeId : ssh[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (sshId == null) {
      setError("Önce bir SSH oturumu açın.");
      return;
    }
    const lp = Number(listenPort);
    const tp = Number(targetPort);
    if (!Number.isInteger(lp) || lp < 0 || lp > 65535) {
      setError("Dinleme portu geçersiz.");
      return;
    }
    if (!Number.isInteger(tp) || tp < 1 || tp > 65535) {
      setError("Hedef portu geçersiz.");
      return;
    }
    setError("");
    try {
      await createTunnel(sshId, kind, lp, targetHost.trim(), tp);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Port Yönlendirme / Tünel</h2>
          <button className="modal-close" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>SSH oturumu</label>
            <select value={sshId ?? ""} onChange={(e) => setSshId(Number(e.target.value))}>
              {sshSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Tür</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="local">Yerel (TCP → SSH)</option>
              <option value="socks5">SOCKS5 proxy</option>
            </select>
          </div>
          <div className="form-row">
            <label>Dinleme portu (127.0.0.1)</label>
            <input
              type="number"
              value={listenPort}
              onChange={(e) => setListenPort(e.target.value)}
              placeholder="0 = otomatik"
            />
          </div>
          {kind === "local" && (
            <>
              <div className="form-row">
                <label>Hedef sunucu</label>
                <input
                  value={targetHost}
                  onChange={(e) => setTargetHost(e.target.value)}
                  placeholder="127.0.0.1"
                />
              </div>
              <div className="form-row">
                <label>Hedef port</label>
                <input
                  type="number"
                  value={targetPort}
                  onChange={(e) => setTargetPort(e.target.value)}
                />
              </div>
            </>
          )}
          {error && <div className="form-error">{error}</div>}
          <div className="modal-footer">
            <button className="btn" onClick={() => void submit()}>
              Tünel Aç
            </button>
          </div>

          <div className="tunnel-list">
            {tunnels.length === 0 && (
              <div className="form-hint">Aktif tünel yok.</div>
            )}
            {tunnels.map((t) => (
              <div key={t.id} className="tunnel-row">
                <span className={`tunnel-status ${t.active ? "on" : "off"}`} />
                <span className="tunnel-desc">
                  {t.kind === "socks5" ? "SOCKS5" : "TCP"} 127.0.0.1:
                  {t.listenPort}
                  {t.kind === "local" && (
                    <>
                      {" "}
                      → {t.targetHost}:{t.targetPort}
                    </>
                  )}
                </span>
                <button
                  className="btn btn-danger"
                  onClick={() => void closeTunnel(t.id)}
                >
                  Kapat
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}