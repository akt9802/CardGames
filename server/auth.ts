import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import type { UserPublic } from "../shared/types.ts";

const dataFile = join(dirname(fileURLToPath(import.meta.url)), "data", "users.json");

interface UserRecord extends UserPublic {
  hash: string;
  salt: string;
}

let users: UserRecord[] = [];

function load() {
  try {
    if (existsSync(dataFile)) {
      users = JSON.parse(readFileSync(dataFile, "utf8"));
    }
  } catch {
    users = [];
  }
}

function save() {
  mkdirSync(dirname(dataFile), { recursive: true });
  writeFileSync(dataFile, JSON.stringify(users, null, 2));
}

load();

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 32).toString("hex");
}

export function publicUser(u: UserRecord): UserPublic {
  return { id: u.id, username: u.username, displayName: u.displayName };
}

export function register(username: string, password: string, displayName: string): UserPublic {
  const uname = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,16}$/.test(uname)) throw new Error("Username must be 3–16 letters, numbers, or _.");
  if (password.length < 4) throw new Error("Password must be at least 4 characters.");
  if (users.some((u) => u.username === uname)) throw new Error("That name is already seated.");
  const salt = randomBytes(16).toString("hex");
  const rec: UserRecord = {
    id: nanoid(12),
    username: uname,
    displayName: displayName.trim() || uname,
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

const tokens = new Map<string, string>();

export function issueToken(userId: string): string {
  const token = nanoid(24);
  tokens.set(token, userId);
  return token;
}

export function userFromToken(token: string | undefined): UserPublic | undefined {
  if (!token) return undefined;
  const id = tokens.get(token);
  return id ? getUser(id) : undefined;
}
