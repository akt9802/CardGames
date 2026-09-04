import { useEffect, useState, type FormEvent } from "react";
import { apiJson } from "../session.ts";

type Status = "PENDING" | "APPROVED" | "REJECTED";
type Row = {
  id: string;
  name: string;
  email: string;
  reason: string;
  status: Status;
  rejectionReason: string;
  signupCompleted: boolean;
  createdAt: number;
};

const ADMIN_KEY = "baithak-admin";

export function AdminDoor() {
  const [token, setToken] = useState(() => sessionStorage.getItem(ADMIN_KEY) ?? "");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [tab, setTab] = useState<Status>("PENDING");
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  async function load(t = token, status = tab) {
    const data = await apiJson<{ requests: Row[] }>(`/api/admin/requests?status=${status}`, undefined, t);
    setRows(data.requests);
  }

  useEffect(() => {
    if (!token) return;
    load().catch((e) => setErr(e instanceof Error ? e.message : "Could not load"));
  }, [token, tab]);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const res = await apiJson<{ token: string }>("/api/admin/login", { username: user, password: pass });
      sessionStorage.setItem(ADMIN_KEY, res.token);
      setToken(res.token);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "No.");
    }
  }

  async function act(id: string, kind: "approve" | "reject") {
    setBusy(id);
    setErr("");
    try {
      const reason = kind === "reject" ? window.prompt("Reason (optional)") ?? "" : "";
      await apiJson(`/api/admin/requests/${id}/${kind}`, kind === "reject" ? { reason } : {}, token);
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy("");
    }
  }

  if (!token) {
    return (
      <div className="auth-wrap">
        <form className="auth-card" onSubmit={signIn}>
          <div className="kicker">Staff door</div>
          <h1>Ledger</h1>
          <p>Approve who may sit. This page is not linked from the parlor.</p>
          <div className="field">
            <label>Handle</label>
            <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" required />
          </div>
          <div className="field">
            <label>Key</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required />
          </div>
          <div className="err">{err}</div>
          <button className="btn solid" type="submit" style={{ width: "100%" }}>
            Open
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      <header className="topbar">
        <div className="mark">
          <span className="ring">♠</span>
          <div>
            <strong>Ledger</strong>
            <span>who may sit</span>
          </div>
        </div>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            apiJson("/api/admin/logout", {}, token).catch(() => undefined);
            sessionStorage.removeItem(ADMIN_KEY);
            setToken("");
          }}
        >
          Lock
        </button>
      </header>
      <div className="admin-body">
        <div className="rank-pick" style={{ marginBottom: 16 }}>
          {(["PENDING", "APPROVED", "REJECTED"] as Status[]).map((s) => (
            <button key={s} type="button" className={tab === s ? "on" : ""} onClick={() => setTab(s)}>
              {s.toLowerCase()}
            </button>
          ))}
        </div>
        <div className="err">{err}</div>
        <div className="admin-table">
          {rows.length === 0 ? <p style={{ color: "var(--mist)" }}>Nothing here.</p> : null}
          {rows.map((r) => (
            <article className="admin-row" key={r.id}>
              <div>
                <strong>{r.name}</strong>
                <div className="mono" style={{ color: "var(--mist)", fontSize: 12 }}>
                  {r.email} · {new Date(r.createdAt).toLocaleString()}
                </div>
                <p>{r.reason}</p>
                {r.status === "APPROVED" ? (
                  <span className="badge">{r.signupCompleted ? "signed up" : "invitation open"}</span>
                ) : null}
                {r.status === "REJECTED" && r.rejectionReason ? <p className="mono">{r.rejectionReason}</p> : null}
              </div>
              {r.status === "PENDING" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn solid" type="button" disabled={busy === r.id} onClick={() => act(r.id, "approve")}>
                    Approve
                  </button>
                  <button className="btn" type="button" disabled={busy === r.id} onClick={() => act(r.id, "reject")}>
                    Reject
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
