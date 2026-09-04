import { io, type Socket } from "socket.io-client";
import type { ChatMessage, RoomPublic, UserPublic } from "@shared/types.ts";

export type Session = { token: string; user: UserPublic };

const KEY = "baithak-session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null) {
  if (!s) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(s));
}

export async function api(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as Session;
}

let socket: Socket | null = null;
let currentToken: string | null = null;

export function connect(token: string) {
  if (socket && currentToken === token) return socket;
  socket?.disconnect();
  currentToken = token;
  socket = io({ auth: { token } });
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
};
