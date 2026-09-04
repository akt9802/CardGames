import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import type { UserMe, UserPublic } from "../shared/types.ts";
import { claimRequest, consumeResetToken, consumeSetupToken, getApprovedOpen, issuePasswordResetOtp, verifyPasswordResetOtp } from "./access.ts";
import { photosDir, readJson, writeJson } from "./store.ts";

interface UserRecord extends UserPublic {
  email?: string;
  phone?: string;
  hash: string;
  salt: string;
}

let users: UserRecord[] = readJson<UserRecord[]>("users.json", []);

function save() {
  writeJson("users.json", users);
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 32).toString("hex");
}

export function publicUser(u: UserRecord): UserPublic {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    photoUrl: u.photoUrl,
    instagram: u.instagram,
  };
}

export function toMe(u: UserRecord): UserMe {
  return {
    ...publicUser(u),
    email: u.email ?? "",
    phone: u.phone ?? "",
  };
}

export function completeSignup(setupToken: string, username: string, password: string, displayName: string) {
  const email = consumeSetupToken(setupToken);
  if (!getApprovedOpen(email)) throw new Error("This invitation is no longer open.");
  if (users.some((u) => u.email === email)) throw new Error("This email already has a chair.");
  const user = register(username, password, displayName, email);
  claimRequest(email, user.id);
  return user;
}

export function register(username: string, password: string, displayName: string, email?: string): UserPublic {
  const uname = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,16}$/.test(uname)) throw new Error("Username must be 3–16 letters, numbers, or _.");
  if (password.length < 4) throw new Error("Password must be at least 4 characters.");
  if (users.some((u) => u.username === uname)) throw new Error("That name is already seated.");
  const salt = randomBytes(16).toString("hex");
  const rec: UserRecord = {
    id: nanoid(12),
    username: uname,
    displayName: displayName.trim() || uname,
    email: email?.trim().toLowerCase(),
    phone: "",
    instagram: "",
    salt,
    hash: hashPassword(password, salt),
  };
  users.push(rec);
  save();
  return publicUser(rec);
}

export function login(username: string, password: string): UserPublic {
  const uname = username.trim().toLowerCase();
  const rec = users.find((u) => u.username === uname);
  if (!rec) throw new Error("Unknown player.");
  const hash = hashPassword(password, rec.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(rec.hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Wrong password.");
  return publicUser(rec);
}

export function getUser(id: string): UserPublic | undefined {
  const rec = users.find((u) => u.id === id);
  return rec ? publicUser(rec) : undefined;
}

export function getMe(id: string): UserMe | undefined {
  const rec = users.find((u) => u.id === id);
  return rec ? toMe(rec) : undefined;
}

export function listPeople(): UserPublic[] {
  return users.map(publicUser);
}

function normalizePhone(raw: string) {
  const v = raw.trim();
  if (!v) return "";
  if (!/^\+?[0-9 ()-]{8,20}$/.test(v)) throw new Error("That phone number does not look right.");
  return v;
}

function normalizeInstagram(raw: string) {
  const v = raw.trim().replace(/^@/, "");
  if (!v) return "";
  if (!/^[A-Za-z0-9._]{2,30}$/.test(v)) throw new Error("Instagram handle: 2–30 letters, numbers, dots, or _.");
  return v;
}

export function updateProfile(id: string, patch: { displayName?: string; phone?: string; instagram?: string }): UserMe {
  const rec = users.find((u) => u.id === id);
  if (!rec) throw new Error("Unknown player.");
  if (patch.displayName !== undefined) {
    const name = patch.displayName.trim();
    if (name.length < 2 || name.length > 32) throw new Error("Table name should be 2–32 characters.");
    rec.displayName = name;
  }
  if (patch.phone !== undefined) rec.phone = normalizePhone(patch.phone);
  if (patch.instagram !== undefined) rec.instagram = normalizeInstagram(patch.instagram);
  save();
  return toMe(rec);
}

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function savePhoto(id: string, dataUrl: string): UserMe {
  const rec = users.find((u) => u.id === id);
  if (!rec) throw new Error("Unknown player.");
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error("Send a JPEG, PNG, or WebP photo.");
  const ext = PHOTO_TYPES[match[1].toLowerCase()] ?? "jpg";
  const buf = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buf.length < 32) throw new Error("That photo is empty.");
  if (buf.length > 1.5 * 1024 * 1024) throw new Error("Keep the photo under 1.5 MB.");
  const dir = photosDir();
  for (const old of ["jpg", "png", "webp"]) {
    const p = join(dir, `${id}.${old}`);
    if (existsSync(p)) unlinkSync(p);
  }
  const file = `${id}.${ext}`;
  writeFileSync(join(dir, file), buf);
  rec.photoUrl = `/photos/${file}?v=${Date.now()}`;
  save();
  return toMe(rec);
}

const ACCESS_MS = 15 * 60 * 1000;
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

interface AccessEntry {
  userId: string;
  exp: number;
}

interface RefreshRecord {
  id: string;
  familyId: string;
  userId: string;
  hash: string;
  exp: number;
  revoked: boolean;
}

const accessTokens = new Map<string, AccessEntry>();
let refreshRows = readJson<RefreshRecord[]>("refresh.json", []);

function saveRefresh() {
  const now = Date.now();
  refreshRows = refreshRows.filter((r) => r.exp > now);
  writeJson("refresh.json", refreshRows);
}

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function mintAccess(userId: string) {
  const token = nanoid(32);
  accessTokens.set(token, { userId, exp: Date.now() + ACCESS_MS });
  return token;
}

function mintRefresh(userId: string, familyId: string) {
  const raw = nanoid(48);
  refreshRows.push({
    id: nanoid(12),
    familyId,
    userId,
    hash: hashToken(raw),
    exp: Date.now() + REFRESH_MS,
    revoked: false,
  });
  saveRefresh();
  return raw;
}

export interface AuthSession {
  user: UserPublic;
  token: string;
  refresh_token: string;
  expires_in: number;
}

export function issueSession(userId: string, familyId = nanoid(12)): AuthSession {
  const user = getUser(userId);
  if (!user) throw new Error("Unknown player.");
  return {
    user,
    token: mintAccess(userId),
    refresh_token: mintRefresh(userId, familyId),
    expires_in: Math.floor(ACCESS_MS / 1000),
  };
}

export function refreshSession(refreshToken: string): AuthSession {
  const hash = hashToken(String(refreshToken ?? ""));
  const row = refreshRows.find((r) => r.hash === hash);
  if (!row) throw new Error("Session expired. Sign in again.");
  if (row.revoked) {
    refreshRows = refreshRows.map((r) => (r.familyId === row.familyId ? { ...r, revoked: true } : r));
    saveRefresh();
    throw new Error("Session expired. Sign in again.");
  }
  if (Date.now() > row.exp) {
    row.revoked = true;
    saveRefresh();
    throw new Error("Session expired. Sign in again.");
  }
  row.revoked = true;
  saveRefresh();
  return issueSession(row.userId, row.familyId);
}

export function revokeAccess(token: string | undefined) {
  if (token) accessTokens.delete(token);
}

export function revokeRefresh(refreshToken: string | undefined) {
  if (!refreshToken) return;
  const hash = hashToken(refreshToken);
  const row = refreshRows.find((r) => r.hash === hash);
  if (!row) return;
  refreshRows = refreshRows.map((r) => (r.familyId === row.familyId ? { ...r, revoked: true } : r));
  saveRefresh();
}

export function revokeAllSessions(userId: string) {
  for (const [token, entry] of accessTokens) {
    if (entry.userId === userId) accessTokens.delete(token);
  }
  refreshRows = refreshRows.map((r) => (r.userId === userId ? { ...r, revoked: true } : r));
  saveRefresh();
}

/** @deprecated access-only; prefer issueSession */
export function issueToken(userId: string): string {
  return mintAccess(userId);
}

export function revokeToken(token: string | undefined, refreshToken?: string) {
  revokeAccess(token);
  revokeRefresh(refreshToken);
}

export function userFromToken(token: string | undefined): UserPublic | undefined {
  if (!token) return undefined;
  const entry = accessTokens.get(token);
  if (!entry) return undefined;
  if (Date.now() > entry.exp) {
    accessTokens.delete(token);
    return undefined;
  }
  return getUser(entry.userId);
}

export function findByLogin(login: string): UserRecord | undefined {
  const v = login.trim().toLowerCase();
  if (!v) return undefined;
  return users.find((u) => u.username === v || u.email === v);
}

export async function requestPasswordReset(login: string) {
  const rec = findByLogin(login);
  if (!rec?.email) return { expiresIn: 600, echo: undefined as string | undefined };
  return issuePasswordResetOtp(rec.email);
}

export async function resendPasswordReset(login: string) {
  const rec = findByLogin(login);
  if (!rec?.email) return { expiresIn: 600, echo: undefined as string | undefined };
  return issuePasswordResetOtp(rec.email, true);
}

export function verifyPasswordReset(login: string, code: string) {
  const rec = findByLogin(login);
  return verifyPasswordResetOtp(rec?.email ?? login, code);
}

export function completePasswordReset(resetToken: string, password: string): AuthSession {
  const email = consumeResetToken(resetToken);
  const rec = users.find((u) => u.email === email);
  if (!rec) throw new Error("Unknown player.");
  if (password.length < 4) throw new Error("Password must be at least 4 characters.");
  rec.salt = randomBytes(16).toString("hex");
  rec.hash = hashPassword(password, rec.salt);
  save();
  revokeAllSessions(rec.id);
  return issueSession(rec.id);
}
