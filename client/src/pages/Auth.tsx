import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, saveSession } from "../session.ts";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const session = await api(mode === "login" ? "/api/login" : "/api/register", {
        username,
        password,
        displayName,
      });
      saveSession(session);
      nav("/lobby");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="kicker">{mode === "login" ? "Welcome back" : "New chair"}</div>
        <h1>{mode === "login" ? "Sign in" : "Take a seat"}</h1>
        <p>A name, a password, then a table. Computers will sit wherever friends do not.</p>
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </div>
        {mode === "register" ? (
          <div className="field">
            <label>How the table should call you</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Optional" />
          </div>
        ) : null}
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        <div className="err">{err}</div>
        <button className="btn solid" type="submit" style={{ width: "100%" }}>
          {mode === "login" ? "Enter" : "Create player"}
        </button>
        <p style={{ marginTop: 16 }}>
          {mode === "login" ? (
            <>
              New here? <Link to="/register">Register</Link>
            </>
          ) : (
            <>
              Already seated? <Link to="/login">Sign in</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
