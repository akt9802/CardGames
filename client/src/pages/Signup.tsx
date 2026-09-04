import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, apiJson, saveSession } from "../session.ts";

type Step = "email" | "otp" | "profile";

export function Signup() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [otp, setOtp] = useState("");
  const [setup, setSetup] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    const q = params.get("email");
    if (q) setEmail(q);
  }, [params]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  async function sendCode(rotate: boolean) {
    setErr("");
    setBusy(true);
    try {
      const path = rotate ? "/api/signup/resend-otp" : "/api/signup/request-otp";
      const res = await apiJson<{ otp?: string; retry_after?: number }>(path, { email });
      if (res.otp) setHint(`Dev code: ${res.otp}`);
      else setHint("");
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

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    await sendCode(false);
  }

  async function checkOtp(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await apiJson<{ setup_token: string }>("/api/signup/verify-otp", { email, otp });
      setSetup(res.setup_token);
      setStep("profile");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Wrong code.");
    } finally {
      setBusy(false);
    }
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const session = await api("/api/signup/complete", {
        setup_token: setup,
        username,
        password,
        displayName,
      });
      saveSession(session);
      nav("/lobby");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not sit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={step === "email" ? onEmail : step === "otp" ? checkOtp : finish}>
        <div className="kicker">Approved guests only</div>
        <h1>Take a seat</h1>
        <p>
          {step === "email" && "Use the email that was approved. We’ll send a six-digit code."}
          {step === "otp" && `Code sent to ${email}. It expires in ten minutes.`}
          {step === "profile" && "Pick a username. Table name is how the felt addresses you."}
        </p>
        {step === "email" ? (
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
        {step === "profile" ? (
          <>
            <div className="field">
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            </div>
            <div className="field">
              <label>Table name (optional)</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How the table should call you" />
            </div>
          </>
        ) : null}
        {hint ? <p className="mono" style={{ color: "var(--mist)", fontSize: 12 }}>{hint}</p> : null}
        <div className="err">{err}</div>
        <button className="btn solid" type="submit" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Wait…" : step === "email" ? "Send code" : step === "otp" ? "Verify" : "Sit down"}
        </button>
        {step === "otp" ? (
          <div className="otp-actions">
            <button
              className="btn ghost"
              type="button"
              disabled={busy || wait > 0}
              onClick={() => void sendCode(true)}
            >
              {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setStep("email");
                setOtp("");
                setErr("");
              }}
            >
              Different email
            </button>
          </div>
        ) : null}
        <p style={{ marginTop: 16 }}>
          Already seated? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
