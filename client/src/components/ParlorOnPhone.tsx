import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  canNativeInstall,
  dismissChimesForNow,
  dismissInstallForNow,
  isAndroid,
  isIos,
  isPhone,
  isStandalone,
  needsHomeScreenForPush,
  onAskShowInstall,
  promptNativeInstall,
  shouldAutoOpenChimes,
  shouldAutoOpenInstall,
  subscribeInstallAvailable,
} from "../pwa.ts";
import { getExistingPushSubscription, isPushSupported, requestAndSubscribeChimes } from "../push.ts";
import { loadSession } from "../session.ts";

type Sheet = "install" | "chimes" | null;

export function ParlorOnPhone() {
  const loc = useLocation();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [native, setNative] = useState(canNativeInstall());
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hide = loc.pathname.startsWith("/play");
  const phone = isPhone();
  const standalone = isStandalone();
  const signedIn = Boolean(loadSession());
  const ios = isIos();
  const android = isAndroid();

  useEffect(() => subscribeInstallAvailable(() => setNative(canNativeInstall())), []);

  useEffect(() => {
    if (!isPushSupported()) return;
    getExistingPushSubscription()
      .then((sub) => setPushOn(Boolean(sub)))
      .catch(() => undefined);
  }, [loc.pathname]);

  useEffect(() => {
    return onAskShowInstall(() => {
      if (!isStandalone()) setSheet("install");
    });
  }, []);

  useEffect(() => {
    if (hide) {
      setSheet(null);
      return;
    }
    if (shouldAutoOpenInstall()) {
      setSheet("install");
      return;
    }
    if (
      signedIn &&
      shouldAutoOpenChimes() &&
      isPushSupported() &&
      !needsHomeScreenForPush() &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      setSheet("chimes");
    }
  }, [hide, loc.pathname, signedIn]);

  if (hide) return null;

  const showPill = phone && !standalone;
  const showInstall = sheet === "install" && !standalone;
  const showChimes = sheet === "chimes" && signedIn && !pushOn && !needsHomeScreenForPush();

  async function install() {
    setErr("");
    setBusy(true);
    try {
      const ok = await promptNativeInstall();
      if (ok) {
        dismissInstallForNow();
        setSheet(null);
      }
    } catch {
      setErr("The browser did not finish adding the parlor. Try the menu instead.");
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    setErr("");
    setBusy(true);
    try {
      const result = await requestAndSubscribeChimes();
      if (result === "on") {
        setPushOn(true);
        dismissChimesForNow();
        setSheet(null);
      } else if (result === "denied") {
        setErr("Notifications are blocked. Allow them in the browser site settings.");
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not enable chimes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {showPill && !showInstall ? (
        <button className="pwa-pill" type="button" onClick={() => setSheet("install")}>
          Add to home screen
        </button>
      ) : null}

      {showInstall ? (
        <div className="pwa-sheet" role="dialog" aria-labelledby="pwa-install-title">
          <div className="kicker">On this phone</div>
          <h2 id="pwa-install-title">Keep the parlor in a pocket</h2>
          <p>
            Add Baithak to the home screen. Tables can then chime when a hand deals or it is your turn — on iPhone that
            only works from the home-screen icon, not a Safari tab.
          </p>
          {ios ? (
            <ol className="pwa-steps">
              <li>
                Tap <ShareGlyph /> <strong>Share</strong> at the bottom of Safari.
              </li>
              <li>
                Scroll and tap <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong>, then open Baithak from the new icon.
              </li>
            </ol>
          ) : android && native ? (
            <p className="pwa-hint">Chrome can place the icon for you.</p>
          ) : (
            <ol className="pwa-steps">
              <li>
                Open the browser menu <strong>⋮</strong>.
              </li>
              <li>
                Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.
              </li>
              <li>Open Baithak from the new icon.</li>
            </ol>
          )}
          <div className="err">{err}</div>
          <div className="pwa-actions">
            {native && !ios ? (
              <button className="btn solid" type="button" disabled={busy} onClick={() => void install()}>
                {busy ? "Adding…" : "Add to home screen"}
              </button>
            ) : null}
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                dismissInstallForNow();
                const nextChimes =
                  signedIn &&
                  shouldAutoOpenChimes() &&
                  isPushSupported() &&
                  !needsHomeScreenForPush() &&
                  typeof Notification !== "undefined" &&
                  Notification.permission === "default";
                setSheet(nextChimes ? "chimes" : null);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}

      {showChimes && !showInstall ? (
        <div className="pwa-sheet" role="dialog" aria-labelledby="pwa-chimes-title">
          <div className="kicker">Table chimes</div>
          <h2 id="pwa-chimes-title">Hear when the table needs you</h2>
          <p>A tap when a table deals, someone sits, or it is your turn and you have stepped away. You can turn this off later on Profile.</p>
          <div className="err">{err}</div>
          <div className="pwa-actions">
            <button className="btn solid" type="button" disabled={busy} onClick={() => void enable()}>
              {busy ? "…" : "Enable"}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                dismissChimesForNow();
                setSheet(null);
              }}
            >
              Later
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ShareGlyph() {
  return (
    <svg className="pwa-share" viewBox="0 0 24 24" aria-hidden width="14" height="14">
      <path
        fill="currentColor"
        d="M12 3.2 7.8 7.4l1.4 1.4 1.8-1.8V15h2V7l1.8 1.8 1.4-1.4L12 3.2zM6 18v2h12v-2H6z"
      />
    </svg>
  );
}
