import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "data");

export function dataPath(name: string) {
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

export function readJson<T>(name: string, fallback: T): T {
  const file = dataPath(name);
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    /* empty or corrupt — start fresh */
  }
  return fallback;
}

export function writeJson(name: string, value: unknown) {
  writeFileSync(dataPath(name), JSON.stringify(value, null, 2));
}

export function photosDir() {
  const folder = join(dir, "photos");
  mkdirSync(folder, { recursive: true });
  return folder;
}
