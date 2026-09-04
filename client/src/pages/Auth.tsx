import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, saveSession } from "../session.ts";

export function AuthPage() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const session = await api("/api/login", { username, password });
      saveSession(session);
      nav("/lobby");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="kicker">Welcome back</div>
        <h1>Sign in</h1>
        <p>A name, a password, then a table. Computers will sit wherever friends do not.</p>
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="err">{err}</div>
        <button className="btn solid" type="submit" style={{ width: "100%" }}>
          Enter
        </button>
        <p style={{ marginTop: 16 }}>
          Forgot the password? <Link to="/forgot-password">Reset it</Link>
        </p>
        <p>
          New here? <Link to="/request-access">Request a chair</Link>
        </p>
      </form>
    </div>
  );
}
