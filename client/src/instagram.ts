export function instagramUrl(handle: string) {
  const h = handle.trim().replace(/^@/, "");
  if (!h) return "";
  return `https://www.instagram.com/${encodeURIComponent(h)}`;
}
