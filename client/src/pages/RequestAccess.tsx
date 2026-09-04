import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../session.ts";

export function RequestAccess() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await apiJson("/api/access/request", { name, email, reason });
      setDone(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="kicker">Invitation only</div>
        <h1>Request a chair</h1>
        <p>The parlor is closed to walk-ins. Leave your name and we’ll write if a seat opens.</p>
        {done ? (
          <p style={{ color: "var(--brass-2)" }}>
            Request is on the table. Watch that inbox — approval arrives by email, with a link to sit.
          </p>
        ) : (
          <>
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" minLength={2} required />
            </div>
            <div className="field">
              <label>Personal email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div className="field">
              <label>Reason for accessing</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} minLength={8} required />
            </div>
            <div className="err">{err}</div>
            <button className="btn solid" type="submit" style={{ width: "100%" }} disabled={busy}>
              {busy ? "Sending…" : "Ask for a chair"}
            </button>
          </>
        )}
        <p style={{ marginTop: 16 }}>
          Already seated? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
