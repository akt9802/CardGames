import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiJson, saveSession } from "../session.ts";

type Step = "login" | "otp" | "password";

export function ForgotPassword() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("login");
  const [login, setLogin] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  async function sendCode(rotate: boolean) {
    setErr("");
    setBusy(true);
    try {
      const path = rotate ? "/api/password/resend-otp" : "/api/password/request-otp";
      const res = await apiJson<{ otp?: string }>(path, { email: login });
      if (res.otp) setHint(`Dev code: ${res.otp}`);
      else setHint("If that chair exists, we sent a six-digit code.");
      setWait(60);
      setOtp("");
      setStep("otp");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not send code.");
      const msg = error instanceof Error ? error.message : "";
      const secs = Number(/Wait (\d+)s/.exec(msg)?.[1] ?? 0);
      if (secs) setWait(secs);
    } finally {
      setBusy(false);
    }
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    await sendCode(false);
  }

  async function checkOtp(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await apiJson<{ reset_token: string }>("/api/password/verify-otp", { email: login, otp });
      setResetToken(res.reset_token);
      setStep("password");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Wrong code.");
    } finally {
      setBusy(false);
    }
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (password !== confirm) {
      setErr("Those passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const session = await api("/api/password/reset", { reset_token: resetToken, password });
      saveSession(session);
      nav("/lobby");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not reset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={step === "login" ? onLogin : step === "otp" ? checkOtp : finish}>
        <div className="kicker">Lost the key</div>
        <h1>Forgot password</h1>
        <p>
          {step === "login" && "Email or username. We'll send a six-digit code if that chair exists."}
          {step === "otp" && `Code sent if ${login} is seated. It expires in ten minutes.`}
          {step === "password" && "Pick a new password. You'll be signed in after."}
        </p>
        {step === "login" ? (
          <div className="field">
            <label>Email or username</label>
            <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
          </div>
        ) : null}
        {step === "otp" ? (
          <div className="field">
            <label>One-time code</label>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
              className="mono"
              required
            />
          </div>
        ) : null}
        {step === "password" ? (
          <>
            <div className="field">
              <label>New password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            </div>
            <div className="field">
              <label>Confirm</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </div>
          </>
        ) : null}
        {hint ? <p className="mono" style={{ color: "var(--mist)", fontSize: 12 }}>{hint}</p> : null}
        <div className="err">{err}</div>
        <button className="btn solid" type="submit" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Wait…" : step === "login" ? "Send code" : step === "otp" ? "Verify" : "Save password"}
        </button>
        {step === "otp" ? (
          <div className="otp-actions">
            <button className="btn ghost" type="button" disabled={busy || wait > 0} onClick={() => void sendCode(true)}>
              {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setStep("login");
                setOtp("");
                setErr("");
              }}
            >
              Different chair
            </button>
          </div>
        ) : null}
        <p style={{ marginTop: 16 }}>
          Remembered it? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
