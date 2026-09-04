type OrientationLock = { lock: (t: string) => Promise<void>; unlock: () => void };

function api(): OrientationLock | null {
  const ori = typeof screen !== "undefined" ? (screen.orientation as unknown as OrientationLock | undefined) : undefined;
  return ori && typeof ori.lock === "function" ? ori : null;
}

function pocketPhone() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 820px) and (pointer: coarse)").matches;
}

export async function lockLandscape() {
  document.documentElement.classList.add("is-play");
  document.documentElement.classList.remove("is-parlor");
  try {
    await api()?.lock("landscape");
  } catch {
    /* Safari tabs often refuse until the parlor is on the home screen */
  }
}

export async function unlockToPortrait() {
  document.documentElement.classList.remove("is-play");
  document.documentElement.classList.add("is-parlor");
  const ori = api();
  try {
    ori?.unlock();
  } catch {
    /* already unlocked */
  }
  if (!pocketPhone()) return;
  try {
    await ori?.lock("portrait");
  } catch {
    /* same as above */
  }
}
