export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const INSTALL_DISMISS_KEY = "baithak-install-dismissed";
const CHIMES_DISMISS_KEY = "baithak-chimes-dismissed";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW_INSTALL_EVENT = "baithak-show-install";

let deferredInstall: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
let listening = false;

export function isStandalone() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches
  );
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function isAndroid() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

export function isPhone() {
  if (typeof window === "undefined") return false;
  if (isIos() || isAndroid()) return true;
  return window.matchMedia("(max-width: 820px) and (pointer: coarse)").matches;
}

/** iOS only exposes PushManager after Add to Home Screen. */
export function needsHomeScreenForPush() {
  return isIos() && !isStandalone();
}

export function listenForInstallPrompt() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event as BeforeInstallPromptEvent;
    installListeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    rememberDismiss(INSTALL_DISMISS_KEY);
    installListeners.forEach((fn) => fn());
  });
}

export function subscribeInstallAvailable(fn: () => void) {
  installListeners.add(fn);
  return () => {
    installListeners.delete(fn);
  };
}

export function canNativeInstall() {
  return Boolean(deferredInstall);
}

export async function promptNativeInstall() {
  if (!deferredInstall) return false;
  const event = deferredInstall;
  deferredInstall = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  installListeners.forEach((fn) => fn());
  return outcome === "accepted";
}

function rememberDismiss(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* private mode */
  }
}

function dismissedRecently(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

export function dismissInstallForNow() {
  rememberDismiss(INSTALL_DISMISS_KEY);
}

export function dismissChimesForNow() {
  rememberDismiss(CHIMES_DISMISS_KEY);
}

export function shouldAutoOpenInstall() {
  return isPhone() && !isStandalone() && !dismissedRecently(INSTALL_DISMISS_KEY);
}

export function shouldAutoOpenChimes() {
  return !dismissedRecently(CHIMES_DISMISS_KEY);
}

export function askShowInstall() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SHOW_INSTALL_EVENT));
}

export function onAskShowInstall(fn: () => void) {
  window.addEventListener(SHOW_INSTALL_EVENT, fn);
  return () => window.removeEventListener(SHOW_INSTALL_EVENT, fn);
}
