import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "../store";

export default function LockScreen() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const setLocked = useSessionStore((s) => s.setLocked);
  const lockVerify = useSessionStore((s) => s.lockVerify);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    if (busy || !password) return;
    setBusy(true);
    setError("");
    const ok = await lockVerify(password);
    setBusy(false);
    if (ok) {
      setPassword("");
      setLocked(false);
    } else {
      setError("Parola hatalı");
      inputRef.current?.focus();
    }
  };

  return (
    <div className="lock-screen">
      <div className="lock-box">
        <div className="lock-icon">🔒</div>
        <h2>UmayTerm kilitli</h2>
        <p>Devam etmek için uygulama parolanızı girin</p>
        <div className="lock-input-wrap">
          <span className="lock-input-icon">🔒</span>
          <input
            ref={inputRef}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="••••••••"
          />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn-primary lock-btn" onClick={submit} disabled={busy || !password}>
          {busy ? "Doğrulanıyor…" : "Kilidi aç"}
        </button>
      </div>
    </div>
  );
}