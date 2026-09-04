import { sendWebPush } from "./push.ts";
import { currentActor, isOnline, type Room } from "./rooms.ts";
import type { TableInvite } from "../shared/types.ts";
import { GAME_META } from "../shared/types.ts";

function gameTitle(room: Room) {
  return room.config.game ? GAME_META[room.config.game].title : "The table";
}

export function notifyTableDealt(room: Room) {
  const title = gameTitle(room);
  for (const seat of room.seats) {
    if (!seat.playerId || seat.isBot) continue;
    void sendWebPush(seat.playerId, `${title} is dealing`, `Table ${room.code} has started.`, `/play/${room.id}`);
  }
}

const lastTurn = new Map<string, number>();

export function notifyTurnIfAway(room: Room) {
  const actor = currentActor(room);
  if (!actor?.playerId || actor.isBot) return;
  if (isOnline(actor.playerId)) return;
  const now = Date.now();
  if (now - (lastTurn.get(actor.playerId) ?? 0) < 8000) return;
  lastTurn.set(actor.playerId, now);
  void sendWebPush(actor.playerId, "Your turn", `${gameTitle(room)} · table ${room.code}`, `/play/${room.id}`);
}

export function notifySeatTaken(room: Room, joinerName: string, hostId: string, joinerId: string) {
  if (hostId === joinerId) return;
  if (isOnline(hostId)) return;
  void sendWebPush(hostId, "Someone sat down", `${joinerName} joined table ${room.code}.`, `/table/${room.id}`);
}

export function notifyInvite(invite: TableInvite) {
  if (invite.kind === "ping") {
    void sendWebPush(
      invite.toId,
      `${invite.fromName} pinged you`,
      invite.roomCode ? `Table ${invite.roomCode} is waiting.` : "Come sit. The parlor is open.",
      invite.roomId ? `/table/${invite.roomId}` : "/people"
    );
    return;
  }
  void sendWebPush(
    invite.toId,
    `${invite.fromName} set a table`,
    `Sit at ${invite.roomCode ?? "the parlor"}. Any of the four games can be dealt there.`,
    invite.roomId ? `/table/${invite.roomId}` : "/lobby"
  );
}
