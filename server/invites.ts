import { nanoid } from "nanoid";
import type { TableInvite, UserPublic } from "../shared/types.ts";
import { getUser } from "./auth.ts";

const invites: TableInvite[] = [];
const lastPing = new Map<string, number>();

export function invitesFor(userId: string) {
  return invites.filter((i) => i.toId === userId).slice(0, 20);
}

export function createInvite(
  kind: "invite" | "ping",
  from: UserPublic,
  toId: string,
  room?: { id: string; code: string }
): TableInvite {
  if (from.id === toId) throw new Error("You are already at the table.");
  const to = getUser(toId);
  if (!to) throw new Error("No such player.");
  if (kind === "ping") {
    const key = `${from.id}:${toId}`;
    const last = lastPing.get(key) ?? 0;
    if (Date.now() - last < 20_000) throw new Error("Wait a moment before pinging again.");
    lastPing.set(key, Date.now());
  }
  const rec: TableInvite = {
    id: nanoid(10),
    kind,
    roomId: room?.id ?? null,
    roomCode: room?.code ?? null,
    fromId: from.id,
    fromName: from.displayName,
    fromPhoto: from.photoUrl,
    toId,
    createdAt: Date.now(),
  };
  invites.unshift(rec);
  while (invites.length > 200) invites.pop();
  return rec;
}

export function dismissInvite(id: string, userId: string) {
  const i = invites.findIndex((x) => x.id === id && x.toId === userId);
  if (i >= 0) invites.splice(i, 1);
}

export function dropInvitesForRoom(roomId: string) {
  for (let i = invites.length - 1; i >= 0; i--) {
    if (invites[i].roomId === roomId && invites[i].kind === "invite") invites.splice(i, 1);
  }
}

