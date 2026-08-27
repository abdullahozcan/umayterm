import { useSessionStore } from "../store";

function fmtKB(kb?: number | null): string {
  if (kb == null) return "—";
  const gb = kb / (1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)}G`;
  const mb = kb / 1024;
  if (mb >= 1) return `${mb.toFixed(0)}M`;
  return `${kb}K`;
}

function barColor(pct: number): string {
  if (pct >= 85) return "#ef4444";
  if (pct >= 60) return "#eab308";
  return "#22c55e";
}

export default function SysStatsPanel({ sessionId }: { sessionId: number }) {
  const stats = useSessionStore((s) => s.stats[sessionId]);
  const open = useSessionStore((s) => !!s.statsOpen[sessionId]);
  const toggle = useSessionStore((s) => s.toggleStats);

  const cpu = stats?.cpu;
  const memUsed = stats?.memUsed;
  const memTotal = stats?.memTotal;
  const memPct =
    memTotal != null ? Math.round(((memUsed ?? 0) / memTotal) * 100) : null;

  return (
    <div className={`sysstats ${open ? "open" : ""}`}>
      <button
        className="sysstats-header"
        onClick={() => toggle(sessionId)}
        title="Sistem durumu (CPU / RAM / Dosya sistemi)"
      >
        <span className="sysstats-chevron">{open ? "▾" : "▸"}</span>
        <span className="sysstats-title">Sistem</span>
        {!open && cpu != null && (
          <span className="sysstats-summary">
            CPU %{Math.round(cpu)} · RAM {memPct != null ? `%${memPct}` : "—"}
          </span>
        )}
      </button>
      {open && (
        <div className="sysstats-body">
          {!stats ? (
            <div className="sysstats-empty">Yükleniyor…</div>
          ) : !stats.ok ? (
            <div className="sysstats-empty">
              İzleme kullanılamıyor
              {stats.error ? ` (${stats.error})` : ""}
            </div>
          ) : (
            <>
              <div className="stat-row">
                <div className="stat-label">
                  <span>CPU</span>
                  <span>{cpu != null ? `%${Math.round(cpu)}` : "—"}</span>
                </div>
                {cpu != null && (
                  <div className="stat-bar">
                    <div
                      className="stat-bar-fill"
                      style={{
                        width: `${Math.min(100, cpu)}%`,
                        background: barColor(cpu),
                      }}
                    />
                  </div>
                )}
                {stats.load.length > 0 && (
                  <div className="stat-sub">
                    Load: {stats.load.map((l) => l.toFixed(2)).join(" ")}
                  </div>
                )}
              </div>
              <div className="stat-row">
                <div className="stat-label">
                  <span>RAM</span>
                  <span>
                    {memUsed != null && memTotal != null
                      ? `${fmtKB(memUsed)} / ${fmtKB(memTotal)}`
                      : "—"}
                  </span>
                </div>
                {memPct != null && (
                  <div className="stat-bar">
                    <div
                      className="stat-bar-fill"
                      style={{
                        width: `${Math.min(100, memPct)}%`,
                        background: barColor(memPct),
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="stat-section">Dosya sistemi</div>
              <div className="fs-list">
                {stats.fs.length === 0 && (
                  <div className="sysstats-empty">Dosya sistemi bulunamadı</div>
                )}
                {stats.fs.map((f) => (
                  <div className="fs-row" key={f.mount}>
                    <div className="fs-top">
                      <span className="fs-mount">{f.mount}</span>
                      <span className="fs-size">
                        {fmtKB(f.used)} / {fmtKB(f.size)} · %{Math.round(f.pct)}
                      </span>
                    </div>
                    <div className="stat-bar fs-bar">
                      <div
                        className="stat-bar-fill"
                        style={{
                          width: `${Math.min(100, f.pct)}%`,
                          background: barColor(f.pct),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}