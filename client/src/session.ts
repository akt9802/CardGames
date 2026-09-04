import { io, type Socket } from "socket.io-client";
import type { ChatMessage, RoomPublic, UserPublic } from "@shared/types.ts";

export type Session = {
  token: string;
  refreshToken: string;
  expiresAt: number;
  user: UserPublic;
};

const KEY = "baithak-session";
const ACCESS_SKEW_MS = 20_000;

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session> & { user?: UserPublic; token?: string };
    if (!parsed.token || !parsed.user) return null;
    return {
      token: parsed.token,
      refreshToken: parsed.refreshToken ?? "",
      expiresAt: parsed.expiresAt ?? 0,
      user: parsed.user,
    };
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null) {
  if (!s) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(s));
}

export function patchSession(partial: Partial<Session>) {
  const s = loadSession();
  if (!s) return;
  saveSession({ ...s, ...partial });
}

export function sessionFromPayload(data: {
  token: string;
  refresh_token?: string;
  expires_in?: number;
  user: UserPublic;
}): Session {
  return {
    token: data.token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: Date.now() + (data.expires_in ?? 15 * 60) * 1000,
    user: data.user,
  };
}

function accessFresh(s: Session | null) {
  return Boolean(s?.token && s.expiresAt > Date.now() + ACCESS_SKEW_MS);
}

let refreshWait: Promise<Session | null> | null = null;

async function refreshAccess(): Promise<Session | null> {
  const s = loadSession();
  if (!s?.refreshToken) return null;
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refreshToken }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: UserPublic;
  };
  if (!res.ok || !data.token || !data.user) {
    if (res.status === 401) saveSession(null);
    return null;
  }
  const next = sessionFromPayload({
    token: data.token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    user: data.user,
  });
  saveSession(next);
  if (socket) connect(next.token);
  return next;
}

export function ensureFreshSession(): Promise<Session | null> {
  const s = loadSession();
  if (accessFresh(s)) return Promise.resolve(s);
  if (!s?.refreshToken) return Promise.resolve(s?.token ? s : null);
  if (!refreshWait) {
    refreshWait = refreshAccess().finally(() => {
      refreshWait = null;
    });
  }
  return refreshWait;
}

export async function ensureSession(): Promise<Session | null> {
  const s = await ensureFreshSession();
  return s?.token ? s : null;
}

export function disconnect() {
  socket?.disconnect();
  socket = null;
  currentToken = null;
}

export async function logout() {
  const s = loadSession();
  try {
    if (s?.token && "serviceWorker" in navigator && "PushManager" in window) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
    }
  } catch {
    /* still sign out */
  }
  try {
    if (s?.token) {
      await fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` },
        body: JSON.stringify({ token: s.token, refresh_token: s.refreshToken }),
      });
    }
  } catch {
    /* still clear locally */
  }
  disconnect();
  saveSession(null);
}

export async function apiJson<T = unknown>(
  path: string,
  body?: unknown,
  token?: string | null,
  retried = false
): Promise<T> {
  const session = await ensureFreshSession();
  const bearer = token ?? session?.token ?? undefined;
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !retried && !path.startsWith("/api/auth/refresh") && loadSession()?.refreshToken) {
    const next = await (refreshWait ?? refreshAccess());
    if (next) return apiJson<T>(path, body, next.token, true);
  }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

export async function api(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return sessionFromPayload(data);
}

let socket: Socket | null = null;
let currentToken: string | null = null;

export function connect(token: string) {
  if (socket && currentToken === token && socket.connected) return socket;
  if (socket && currentToken === token) return socket;
  socket?.disconnect();
  currentToken = token;
  socket = io({ auth: { token } });
  socket.on("connect_error", () => {
    void ensureFreshSession().then((s) => {
      if (s && s.token !== currentToken) connect(s.token);
    });
  });
  return socket;
}

export function getSocket() {
  return socket;
}

export function emit<T = unknown>(ev: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error("Not connected"));
    const wait = setTimeout(() => resolve({ ok: true } as T), 2500);
    socket.emit(ev, ...args, (res: T) => {
      clearTimeout(wait);
      resolve(res);
    });
  });
}

export type LobbyTable = {
  id: string;
  code: string;
  game: RoomPublic["config"]["game"];
  seats: number;
  filled: number;
  phase: RoomPublic["phase"];
};

export type Hello = {
  user: UserPublic;
  tables: LobbyTable[];
  lobbyChat: ChatMessage[];
  invites?: import("@shared/types.ts").TableInvite[];
};
