import { useSessionStore } from "../store";

export default function HostKeyModal() {
  const pending = useSessionStore((s) => s.pendingHostKey);
  const confirmHostKey = useSessionStore((s) => s.confirmHostKey);
  const rejectHostKey = useSessionStore((s) => s.rejectHostKey);

  if (!pending) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Host anahtarı doğrulanamadı</h2>
        <p className="hostkey-text">
          {pending.changed
            ? "UYARI: Bu sunucunun host anahtarı daha önce kaydettiğinizden FARKLI. Bu bir saldırı (MITM) olabilir. Devam etmek istediğinize emin misiniz?"
            : "Bu sunucunun kimliği daha önce doğrulanmadı. Bağlantıya devam etmek istiyor musunuz?"}
        </p>
        <div className="hostkey-fp">{pending.fingerprint}</div>
        <div className="modal-actions">
          <button className="btn" onClick={rejectHostKey}>
            Reddet
          </button>
          <button className="btn primary" onClick={confirmHostKey}>
            {pending.changed ? "Yine de Kabul Et" : "Kabul Et ve Bağlan"}
          </button>
        </div>
      </div>
    </div>
  );
}