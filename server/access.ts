import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import "./env.ts";
import { mailConfigured, sendAccessApproved, sendPasswordResetOtp, sendSignupOtp } from "./mail.ts";
import { readJson, writeJson } from "./store.ts";

export type AccessStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AccessRequest {
  id: string;
  name: string;
  email: string;
  reason: string;
  status: AccessStatus;
  rejectionReason: string;
  userId: string | null;
  createdAt: number;
  reviewedAt: number | null;
}

export type OtpPurpose = "SIGNUP" | "RESET";

interface OtpRecord {
  email: string;
  purpose: OtpPurpose;
  digest: string;
  expiresAt: number;
  attempts: number;
  used: boolean;
  plaintext?: string;
}

const OTP_MAX = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);
const OTP_MS = 10 * 60 * 1000;
const SETUP_MS = 20 * 60 * 1000;
const RESET_MS = 20 * 60 * 1000;
const ADMIN_USER = process.env.ADMIN_USERNAME ?? "zakAddKK";
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? "12qw!@QWzak765";
const hmacSecret = process.env.OTP_SECRET ?? "baithak-otp-dev";

let requests = readJson<AccessRequest[]>("access.json", []);
let otps = readJson<OtpRecord[]>("otps.json", []).map((o) => ({
  ...o,
  purpose: o.purpose ?? "SIGNUP",
}));
const adminTokens = new Map<string, number>();
const setupTokens = new Map<string, { email: string; exp: number }>();
const resetTokens = new Map<string, { email: string; exp: number }>();
const lastSend = new Map<string, number>();

function persist() {
  writeJson("access.json", requests.map(({ ...r }) => r));
  writeJson(
    "otps.json",
    otps.map((o) => ({ ...o, plaintext: undefined }))
  );
}

function normEmail(email: string) {
  return email.trim().toLowerCase();
}

function digest(email: string, code: string, purpose: OtpPurpose) {
  return createHmac("sha256", hmacSecret).update(`${normEmail(email)}:${purpose}:${code}`).digest("hex");
}

function cooldownError(wait: number) {
  const err = new Error(`Wait ${wait}s before another code.`);
  (err as Error & { retryAfter?: number }).retryAfter = wait;
  return err;
}

async function issueOtp(email: string, purpose: OtpPurpose, rotate: boolean) {
  const em = normEmail(email);
  const now = Date.now();
  const sendKey = `${purpose}:${em}`;
  const last = lastSend.get(sendKey) ?? 0;
  if (now - last < 60_000) {
    throw cooldownError(Math.ceil((60_000 - (now - last)) / 1000));
  }
  const live = otps.find((o) => o.email === em && o.purpose === purpose && !o.used && o.expiresAt > now && o.plaintext);
  let code: string;
  if (live?.plaintext && !rotate) {
    code = live.plaintext;
  } else {
    otps = otps.map((o) => (o.email === em && o.purpose === purpose && !o.used ? { ...o, used: true } : o));
    code = String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, "0");
    otps.push({
      email: em,
      purpose,
      digest: digest(em, code, purpose),
      expiresAt: now + OTP_MS,
      attempts: 0,
      used: false,
      plaintext: code,
    });
    persist();
  }
  lastSend.set(sendKey, now);
  if (purpose === "RESET") await sendPasswordResetOtp(em, code);
  else await sendSignupOtp(em, code);
  return { expiresIn: 600, echo: mailConfigured() ? undefined : code };
}

function verifyOtp(email: string, code: string, purpose: OtpPurpose) {
  const em = normEmail(email);
  const raw = String(code ?? "").replace(/\s/g, "");
  const rec = [...otps].reverse().find((o) => o.email === em && o.purpose === purpose && !o.used);
  if (!rec) throw new Error("No live code for this email. Request a new one.");
  if (Date.now() > rec.expiresAt) throw new Error("That code has expired.");
  rec.attempts += 1;
  if (rec.attempts > OTP_MAX) {
    rec.used = true;
    persist();
    throw new Error("Too many guesses. Request a new code.");
  }
  const ok = safeEq(rec.digest, digest(em, raw, purpose));
  persist();
  if (!ok) throw new Error("Wrong code.");
  rec.used = true;
  rec.plaintext = undefined;
  persist();
  return em;
}

function safeEq(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, Buffer.alloc(ba.length));
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export function requestAccess(name: string, email: string, reason: string): AccessRequest {
  const nm = name.trim();
  const em = normEmail(email);
  const why = reason.trim();
  if (nm.length < 2) throw new Error("Name is too short.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error("That email does not look right.");
  if (why.length < 8) throw new Error("Tell us a little more about why you want a chair.");
  if (requests.some((r) => r.email === em && (r.status === "PENDING" || (r.status === "APPROVED" && !r.userId)))) {
    throw new Error("A request for this email is already on the table.");
  }
  const rec: AccessRequest = {
    id: nanoid(10),
    name: nm,
    email: em,
    reason: why.slice(0, 800),
    status: "PENDING",
    rejectionReason: "",
    userId: null,
    createdAt: Date.now(),
    reviewedAt: null,
  };
  requests.unshift(rec);
  persist();
  return rec;
}

export function listRequests(status?: AccessStatus) {
  return status ? requests.filter((r) => r.status === status) : requests;
}

export function getApprovedOpen(email: string) {
  return requests.find((r) => r.email === normEmail(email) && r.status === "APPROVED" && !r.userId) ?? null;
}

export function claimRequest(email: string, userId: string) {
  const rec = getApprovedOpen(email);
  if (!rec) throw new Error("No approved invitation for this email.");
  rec.userId = userId;
  persist();
}

export async function approveRequest(id: string) {
  const rec = requests.find((r) => r.id === id);
  if (!rec) throw new Error("No such request.");
  if (rec.status !== "PENDING") throw new Error("That request is already settled.");
  rec.status = "APPROVED";
  rec.reviewedAt = Date.now();
  persist();
  await sendAccessApproved(rec.email, rec.name);
  return rec;
}

export function rejectRequest(id: string, reason = "") {
  const rec = requests.find((r) => r.id === id);
  if (!rec) throw new Error("No such request.");
  if (rec.status !== "PENDING") throw new Error("That request is already settled.");
  rec.status = "REJECTED";
  rec.rejectionReason = reason.slice(0, 400);
  rec.reviewedAt = Date.now();
  persist();
  return rec;
}

export async function issueSignupOtp(email: string, rotate = false) {
  const em = normEmail(email);
  if (!getApprovedOpen(em)) throw new Error("This email has not been approved yet.");
  return issueOtp(em, "SIGNUP", rotate);
}

export function verifySignupOtp(email: string, code: string) {
  const em = verifyOtp(email, code, "SIGNUP");
  const token = nanoid(32);
  setupTokens.set(token, { email: em, exp: Date.now() + SETUP_MS });
  return token;
}

export function consumeSetupToken(token: string) {
  const row = setupTokens.get(token);
  if (!row || Date.now() > row.exp) throw new Error("Setup window expired. Verify the email again.");
  setupTokens.delete(token);
  return row.email;
}

export async function issuePasswordResetOtp(email: string, rotate = false) {
  return issueOtp(normEmail(email), "RESET", rotate);
}

export function verifyPasswordResetOtp(email: string, code: string) {
  const em = verifyOtp(email, code, "RESET");
  const token = nanoid(32);
  resetTokens.set(token, { email: em, exp: Date.now() + RESET_MS });
  return token;
}

export function consumeResetToken(token: string) {
  const row = resetTokens.get(token);
  if (!row || Date.now() > row.exp) throw new Error("Reset window expired. Request a new code.");
  resetTokens.delete(token);
  return row.email;
}

export function adminLogin(username: string, password: string) {
  if (!safeEq(username.trim(), ADMIN_USER) || !safeEq(password, ADMIN_PASS)) {
    throw new Error("Unknown door.");
  }
  const token = nanoid(32);
  adminTokens.set(token, Date.now() + 12 * 60 * 60 * 1000);
  return token;
}

export function adminFromToken(token: string | undefined) {
  if (!token) return false;
  const exp = adminTokens.get(token);
  if (!exp || Date.now() > exp) {
    adminTokens.delete(token);
    return false;
  }
  return true;
}

export function adminLogout(token: string) {
  adminTokens.delete(token);
}
