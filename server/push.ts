import webpush from "web-push";
import "./env.ts";
import { readJson, writeJson } from "./store.ts";

interface PushRow {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  updatedAt: number;
}

interface VapidFile {
  publicKey: string;
  privateKey: string;
}

let subs = readJson<PushRow[]>("push.json", []);

function persist() {
  writeJson("push.json", subs);
}

function contact() {
  const raw = (process.env.VAPID_CONTACT || process.env.EMAIL_FROM_ADDRESS || "hello@games.zakarias.in").trim();
  if (raw.startsWith("mailto:") || raw.startsWith("https://")) return raw;
  return `mailto:${raw}`;
}

function loadVapid(): VapidFile | null {
  const fromEnv = {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  };
  if (fromEnv.publicKey && fromEnv.privateKey) return fromEnv;
  const stored = readJson<VapidFile | null>("vapid.json", null);
  if (stored?.publicKey && stored.privateKey) return stored;
  try {
    const generated = webpush.generateVAPIDKeys();
    const keys = { publicKey: generated.publicKey, privateKey: generated.privateKey };
    writeJson("vapid.json", keys);
    console.log("[push] generated VAPID keys into server/data/vapid.json");
    return keys;
  } catch (e) {
    console.error("[push] could not generate VAPID keys", e);
    return null;
  }
}

const vapid = loadVapid();
if (vapid) {
  webpush.setVapidDetails(contact(), vapid.publicKey, vapid.privateKey);
}

export function vapidPublicKey() {
  return vapid?.publicKey ?? null;
}

export function pushConfigured() {
  return Boolean(vapid?.publicKey && vapid.privateKey);
}

export function upsertSubscription(userId: string, payload: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }) {
  const endpoint = String(payload.endpoint ?? "").trim();
  const p256dh = String(payload.keys?.p256dh ?? "").trim();
  const auth = String(payload.keys?.auth ?? "").trim();
  if (!endpoint || !p256dh || !auth) throw new Error("Incomplete push subscription.");
  const existing = subs.find((s) => s.endpoint === endpoint);
  if (existing) {
    existing.userId = userId;
    existing.p256dh = p256dh;
    existing.auth = auth;
    existing.updatedAt = Date.now();
  } else {
    subs.push({ userId, endpoint, p256dh, auth, updatedAt: Date.now() });
  }
  persist();
}

export function dropSubscription(userId: string, endpoint: string) {
  subs = subs.filter((s) => !(s.userId === userId && s.endpoint === endpoint));
  persist();
}

export async function sendWebPush(userId: string, title: string, body: string, url: string) {
  if (!pushConfigured() || !vapid) return;
  const payload = JSON.stringify({
    title,
    body,
    url,
    icon: "/icon-192.png",
  });
  const mine = subs.filter((s) => s.userId === userId);
  for (const row of mine) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
        { TTL: 60, vapidDetails: { subject: contact(), publicKey: vapid.publicKey, privateKey: vapid.privateKey } }
      );
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        subs = subs.filter((s) => s.endpoint !== row.endpoint);
        persist();
      } else {
        console.error("[push] send failed", status, error instanceof Error ? error.message : error);
      }
    }
  }
}
