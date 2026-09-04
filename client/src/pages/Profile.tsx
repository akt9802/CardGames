import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark.tsx";
import {
  getExistingPushSubscription,
  isPushSupported,
  requestAndSubscribeChimes,
  sendTestPush,
  unsubscribeFromPushNotifications,
} from "../push.ts";
import { askShowInstall, isStandalone, needsHomeScreenForPush } from "../pwa.ts";
import { instagramUrl } from "../instagram.ts";
import { apiJson, loadSession, logout, patchSession } from "../session.ts";
import type { UserMe } from "@shared/types.ts";

export function Profile() {
  const nav = useNavigate();
  const session = loadSession()!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<UserMe | null>(null);
  const [displayName, setDisplayName] = useState(session.user.displayName);
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    apiJson<{ user: UserMe }>("/api/me", undefined, session.token)
      .then((data) => {
        setMe(data.user);
        setDisplayName(data.user.displayName);
        setPhone(data.user.phone);
        setInstagram(data.user.instagram ?? "");
        patchSession({ user: data.user });
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load chair."));
  }, [session.token]);

  useEffect(() => {
    if (!isPushSupported()) return;
    setPushPermission(Notification.permission);
    getExistingPushSubscription()
      .then((sub) => setPushOn(Boolean(sub)))
      .catch(() => undefined);
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    setBusy(true);
    try {
      const data = await apiJson<{ user: UserMe }>(
        "/api/me",
        { displayName, phone, instagram },
        session.token
      );
      setMe(data.user);
      patchSession({ user: data.user });
      setOk("Chair updated.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setErr("");
    setOk("");
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read photo."));
      reader.readAsDataURL(file);
    });
    try {
      const data = await apiJson<{ user: UserMe }>("/api/me/photo", { image: dataUrl }, session.token);
      setMe(data.user);
      patchSession({ user: data.user });
      setOk("Portrait hung.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not hang the portrait.");
    }
  }

  async function togglePush() {
    setPushBusy(true);
    setErr("");
    try {
      if (pushOn) {
        await unsubscribeFromPushNotifications();
        setPushOn(false);
        setOk("Chimes off.");
      } else {
        const result = await requestAndSubscribeChimes();
        setPushPermission(Notification.permission);
        if (result === "on") {
          setPushOn(true);
          setOk("Chimes on. We'll tap you when the table needs you.");
        } else if (result === "denied") {
          setErr("Notifications are blocked. Allow them in the browser site settings.");
        }
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not change chimes.");
    } finally {
      setPushBusy(false);
    }
  }

  const photo = me?.photoUrl ?? session.user.photoUrl;
  const standalone = isStandalone();
  const needHome = needsHomeScreenForPush();
  const canEnable = isPushSupported() && !needHome;

  return (
    <>
      <header className="topbar">
        <Link className="mark" to="/lobby">
          <BrandMark kicker={session.user.displayName} />
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn" to="/people">
            People
          </Link>
          <button
            className="btn ghost"
            type="button"
            onClick={async () => {
              await logout();
              nav("/");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="profile-wrap">
        <div className="kicker">Your chair</div>
        <h1 className="display" style={{ fontSize: 44, marginBottom: 8 }}>
          Profile
        </h1>
        <p style={{ color: "var(--mist)", marginTop: 0 }}>
          How the parlor knows you. Phone and email stay private. Portrait, table name, and Instagram are on your public chair — anyone seated can open it.
        </p>

        <div className="avatar-edit">
          <button type="button" className="portrait" onClick={() => fileRef.current?.click()}>
            {photo ? <img src={photo} alt="" /> : <span>{(displayName || "?").slice(0, 1)}</span>}
          </button>
          <div>
            <p className="mono" style={{ color: "var(--mist)", fontSize: 12, margin: 0 }}>
              @{session.user.username}
            </p>
            <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
              Hang a portrait
            </button>
            <p style={{ color: "var(--mist)", fontSize: 13, margin: "8px 0 0" }}>JPEG, PNG or WebP. Under 1.5 MB.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => onPhoto(e.target.files?.[0])}
          />
        </div>

        <form className="auth-card" style={{ width: "100%" }} onSubmit={save}>
          <div className="field">
            <label>Table name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} required />
          </div>
          <div className="field">
            <label>Phone number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+91 98xxx xxxxx"
            />
          </div>
          <div className="field">
            <label>Instagram</label>
            <div className="ig-input">
              <span>@</span>
              <input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
                autoComplete="nickname"
                placeholder="handle"
              />
            </div>
            {instagram.trim() ? (
              <p style={{ margin: "8px 0 0" }}>
                <a className="ig-out" href={instagramUrl(instagram)} target="_blank" rel="noopener noreferrer">
                  {instagramUrl(instagram)}
                </a>
              </p>
            ) : null}
          </div>
          {me?.email ? (
            <p className="mono" style={{ color: "var(--mist)", fontSize: 12 }}>
              {me.email}
            </p>
          ) : null}

          <div className="push-card">
            <div>
              <div className="kicker" style={{ marginBottom: 4 }}>
                Table chimes
              </div>
              <p style={{ margin: 0, color: "var(--mist)", fontSize: 14 }}>
                Tap when a table deals, someone sits, or it's your turn and you've stepped away.
              </p>
              {needHome ? (
                <p style={{ margin: "8px 0 0", color: "var(--brass-2)", fontSize: 13 }}>
                  iPhone only rings from the home-screen parlor. Add Baithak first, open the icon, then Enable.
                </p>
              ) : null}
              {!needHome && !isPushSupported() ? (
                <p style={{ margin: "8px 0 0", color: "var(--brass-2)", fontSize: 13 }}>
                  This browser does not take parlor chimes.
                </p>
              ) : null}
              {pushPermission === "denied" ? (
                <p style={{ margin: "8px 0 0", color: "var(--brass-2)", fontSize: 13 }}>
                  Blocked by the browser. Check site settings.
                </p>
              ) : null}
            </div>
            <button
              className={`btn ${pushOn ? "solid" : ""}`}
              type="button"
              disabled={pushBusy || !canEnable}
              onClick={togglePush}
            >
              {pushBusy ? "…" : pushOn ? "On" : "Enable"}
            </button>
          </div>
          {pushOn ? (
            <button
              className="btn ghost"
              type="button"
              onClick={async () => {
                try {
                  await sendTestPush();
                  setOk("Trial chime sent. Check the lock screen.");
                } catch (error) {
                  setErr(error instanceof Error ? error.message : "Could not chime.");
                }
              }}
            >
              Send a trial chime
            </button>
          ) : null}

          {!standalone ? (
            <button className="btn" type="button" onClick={() => askShowInstall()}>
              Add to home screen
            </button>
          ) : null}

          <div className="err">{err}</div>
          {ok ? <p style={{ color: "var(--brass-2)", minHeight: 18 }}>{ok}</p> : <p style={{ minHeight: 18 }} />}
          <button className="btn solid" type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Saving…" : "Save chair"}
          </button>
        </form>
      </div>
    </>
  );
}
