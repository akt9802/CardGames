import { nanoid } from "nanoid";
import { BOT_NAMES, GAME_META, type ChatMessage, type ClientAction, type GameState, type RoomConfig, type RoomPhase, type RoomPublic, type Seat, type TeamId, type UserPublic } from "../shared/types.ts";
import { applyBluff, createBluff, hideBluff, resolveBluffTimeout } from "./engine/bluff.ts";
import { applyCallBreak, createCallBreak, hideCallBreak } from "./engine/callBreak.ts";
import { applyCabo, createCabo, hideCabo } from "./engine/cabo.ts";
import { applyMendi, createMendi, hideMendi, teamOf } from "./engine/mendi.ts";
import { botAction } from "./engine/bots.ts";

export interface Room {
  id: string;
  code: string;
  hostId: string;
  config: RoomConfig;
  phase: RoomPhase;
  seats: Seat[];
  chat: ChatMessage[];
  game: GameState | null;
  botTimer: ReturnType<typeof setTimeout> | null;
  challengeTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, Room>();
const lobbyChat: ChatMessage[] = [];
const socketsByUser = new Map<string, Set<string>>();

export function getLobbyChat() {
  return lobbyChat.slice(-80);
}

export function pushLobby(from: UserPublic, text: string): ChatMessage {
  const msg: ChatMessage = {
    id: nanoid(8),
    at: Date.now(),
    fromId: from.id,
    fromName: from.displayName,
    text: text.slice(0, 280),
    scope: "lobby",
  };
  lobbyChat.push(msg);
  if (lobbyChat.length > 200) lobbyChat.shift();
  return msg;
}

function code(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  if ([...rooms.values()].some((r) => r.code === s)) return code();
  return s;
}

export function createRoom(host: UserPublic, config: RoomConfig): Room {
  const meta = GAME_META[config.game];
  if (!meta.seatOptions.includes(config.seats)) {
    throw new Error(`This table seats ${meta.seatOptions.join(" or ")}.`);
  }
  const teams = meta.teams;
  const seats: Seat[] = Array.from({ length: config.seats }, (_, i) => ({
    index: i,
    playerId: i === 0 ? host.id : null,
    name: i === 0 ? host.displayName : "Empty",
    isBot: false,
    ready: i === 0,
    connected: i === 0,
    team: teams ? (i % 2 === 0 ? "A" : "B") : undefined,
  }));
  const room: Room = {
    id: nanoid(10),
    code: code(),
    hostId: host.id,
    config: { ...config, fillBots: config.fillBots !== false },
    phase: "lobby",
    seats,
    chat: [],
    game: null,
    botTimer: null,
    challengeTimer: null,
  };
  rooms.set(room.id, room);
  return room;
}

export function getRoom(id: string) {
  return rooms.get(id);
}

export function getRoomByCode(c: string) {
  const up = c.trim().toUpperCase();
  return [...rooms.values()].find((r) => r.code === up);
}

export function roomsForLobby() {
  return [...rooms.values()]
    .filter((r) => r.phase !== "finished")
    .map((r) => ({
      id: r.id,
      code: r.code,
      game: r.config.game,
      seats: r.config.seats,
      filled: r.seats.filter((s) => s.playerId).length,
      phase: r.phase,
    }));
}

function usedBotNames(room: Room) {
  return new Set(room.seats.filter((s) => s.isBot).map((s) => s.name));
}

function nextBotName(room: Room) {
  const used = usedBotNames(room);
  return BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${room.seats.filter((s) => s.isBot).length + 1}`;
}

export function joinRoom(room: Room, user: UserPublic): number {
  const existing = room.seats.find((s) => s.playerId === user.id);
  if (existing) {
    existing.connected = true;
    existing.name = user.displayName;
    return existing.index;
  }
  if (room.phase !== "lobby") throw new Error("This table is already in play.");
  const empty = room.seats.find((s) => !s.playerId);
  if (!empty) throw new Error("Table is full.");
  empty.playerId = user.id;
  empty.name = user.displayName;
  empty.isBot = false;
  empty.ready = false;
  empty.connected = true;
  return empty.index;
}

export function leaveRoom(room: Room, userId: string) {
  const seat = room.seats.find((s) => s.playerId === userId && !s.isBot);
  if (!seat) return;
  if (room.phase === "playing") {
    seat.connected = false;
    return;
  }
  seat.playerId = null;
  seat.name = "Empty";
  seat.ready = false;
  seat.connected = false;
  if (room.hostId === userId) {
    const next = room.seats.find((s) => s.playerId && !s.isBot);
    if (next?.playerId) room.hostId = next.playerId;
  }
}

export function setReady(room: Room, userId: string, ready: boolean) {
  const seat = room.seats.find((s) => s.playerId === userId);
  if (seat) seat.ready = ready;
}

export function fillBots(room: Room) {
  for (const seat of room.seats) {
    if (!seat.playerId) {
      seat.playerId = `bot-${room.id}-${seat.index}`;
      seat.name = nextBotName(room);
      seat.isBot = true;
      seat.ready = true;
      seat.connected = true;
    }
  }
}

export function canStart(room: Room) {
  const humans = room.seats.filter((s) => s.playerId && !s.isBot);
  if (!humans.length) return false;
  if (room.config.fillBots) fillBots(room);
  const filled = room.seats.filter((s) => s.playerId);
  if (filled.length !== room.seats.length) return false;
  return humans.every((s) => s.ready);
}

export function startGame(room: Room) {
  if (!canStart(room)) throw new Error("Everyone must be ready, and empty seats need computers or players.");
  const n = room.seats.length;
  if (room.config.game === "bluff") room.game = createBluff(n);
  else if (room.config.game === "callBreak") {
    room.game = createCallBreak(n, room.config.callBreakRounds ?? 5, room.config.trumpMode ?? "classic");
  } else if (room.config.game === "cabo") room.game = createCabo(n);
  else room.game = createMendi(n, room.config.mendiHandsToWin ?? 5, room.config.trumpMode ?? "classic");
  room.phase = "playing";
}

export function hideGame(game: GameState, viewerSeat: number | null): GameState {
  if (game.game === "bluff") return hideBluff(game, viewerSeat);
  if (game.game === "callBreak") return hideCallBreak(game, viewerSeat);
  if (game.game === "cabo") return hideCabo(game, viewerSeat);
  return hideMendi(game, viewerSeat);
}

export function publicRoom(room: Room, userId: string | null): RoomPublic {
  const youSeat = userId ? room.seats.find((s) => s.playerId === userId)?.index ?? null : null;
  const chat = room.chat.filter((m) => {
    if (m.scope !== "team") return true;
    if (youSeat === null) return false;
    return m.team === room.seats[youSeat].team;
  });
  return {
    id: room.id,
    code: room.code,
    hostId: room.hostId,
    config: room.config,
    phase: room.phase,
    seats: room.seats.map((s) => ({ ...s })),
    chat,
    game: room.game && room.phase !== "lobby" ? hideGame(room.game, youSeat) : null,
    youSeat,
  };
}

export function roomChat(room: Room, from: UserPublic, text: string, team?: boolean): ChatMessage {
  const seat = room.seats.find((s) => s.playerId === from.id);
  const msg: ChatMessage = {
    id: nanoid(8),
    at: Date.now(),
    fromId: from.id,
    fromName: from.displayName,
    text: text.slice(0, 280),
    scope: team ? "team" : "room",
    team: team && seat?.team ? seat.team : undefined,
  };
  if (team && !seat?.team) throw new Error("No team chat at this table.");
  room.chat.push(msg);
  if (room.chat.length > 250) room.chat.shift();
  return msg;
}

export function apply(room: Room, userId: string, action: ClientAction): { error?: string } {
  if (!room.game) return { error: "No game." };
  const seat = room.seats.find((s) => s.playerId === userId);
  if (!seat) return { error: "You are not seated." };
  const names = room.seats.map((s) => s.name);
  const n = room.seats.length;
  if (room.game.game === "bluff") {
    const res = applyBluff(room.game, action, seat.index, n, names);
    if (res.error) return { error: res.error };
    room.game = res.state;
    if (res.state.phase === "over") room.phase = "finished";
    return {};
  }
  if (room.game.game === "callBreak") {
    const res = applyCallBreak(room.game, action, seat.index, n, names);
    if (res.error) return { error: res.error };
    room.game = res.state;
    if (res.state.phase === "over") room.phase = "finished";
    return {};
  }
  if (room.game.game === "cabo") {
    const res = applyCabo(room.game, action, seat.index, n, names);
    if (res.error) return { error: res.error };
    room.game = res.state;
    if (res.state.phase === "over") room.phase = "finished";
    return {};
  }
  const res = applyMendi(room.game, action, seat.index, n, names);
  if (res.error) return { error: res.error };
  room.game = res.state;
  if (res.state.phase === "over") room.phase = "finished";
  return {};
}

export function currentActor(room: Room): Seat | null {
  if (!room.game || room.phase !== "playing") return null;
  const g = room.game;
  if (g.game === "bluff") {
    if (g.phase === "over") return null;
    if (g.phase === "challenge") return null;
    return room.seats[g.currentSeat] ?? null;
  }
  if (g.game === "callBreak") {
    if (g.phase === "over" || g.phase === "holding" || g.phase === "showPower") return null;
    return room.seats[g.currentSeat] ?? null;
  }
  if (g.game === "cabo") {
    if (g.phase === "over" || g.phase === "reveal" || g.phase === "showing" || g.phase === "peek") return null;
    return room.seats[g.currentSeat] ?? null;
  }
  if (g.phase === "over" || g.phase === "holding" || g.phase === "showPower") return null;
  return room.seats[g.currentSeat] ?? null;
}

export function trackSocket(userId: string, socketId: string) {
  const set = socketsByUser.get(userId) ?? new Set();
  set.add(socketId);
  socketsByUser.set(userId, set);
}

export function untrackSocket(userId: string, socketId: string) {
  socketsByUser.get(userId)?.delete(socketId);
}

export { teamOf };
