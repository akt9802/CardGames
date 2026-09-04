import express from "express";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type { ClientAction, GameId, RoomConfig, TrumpMode, UserPublic } from "../shared/types.ts";
import { GAME_META } from "../shared/types.ts";
import { issueToken, login, register, userFromToken } from "./auth.ts";
import { botAction } from "./engine/bots.ts";
import { resolveBluffTimeout } from "./engine/bluff.ts";
import {
  apply,
  createRoom,
  currentActor,
  fillBots,
  getLobbyChat,
  getRoom,
  getRoomByCode,
  joinRoom,
  leaveRoom,
  publicRoom,
  pushLobby,
  roomChat,
  roomsForLobby,
  setReady,
  startGame,
  type Room,
} from "./rooms.ts";

const app = express();
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});

const PORT = Number(process.env.PORT ?? 3001);

function authUser(token: unknown): UserPublic {
  const user = userFromToken(typeof token === "string" ? token : undefined);
  if (!user) throw new Error("Sign in first.");
  return user;
}

app.post("/api/register", (req, res) => {
  try {
    const { username, password, displayName } = req.body ?? {};
    const user = register(String(username ?? ""), String(password ?? ""), String(displayName ?? ""));
    const token = issueToken(user.id);
    res.json({ user, token });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not register." });
  }
});

app.post("/api/login", (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    const user = login(String(username ?? ""), String(password ?? ""));
    const token = issueToken(user.id);
    res.json({ user, token });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not sign in." });
  }
});

app.get("/api/meta", (_req, res) => {
  res.json({ games: GAME_META });
});

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
app.use(express.static(dist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
  res.sendFile(join(dist, "index.html"), (err) => {
    if (err) next();
  });
});

function emitRoom(room: Room) {
  for (const seat of room.seats) {
    if (!seat.playerId || seat.isBot) continue;
    io.to(`user:${seat.playerId}`).emit("room:state", publicRoom(room, seat.playerId));
  }
}

function emitLobby() {
  io.to("lobby").emit("lobby:tables", roomsForLobby());
}

function clearTimers(room: Room) {
  if (room.botTimer) clearTimeout(room.botTimer);
  if (room.challengeTimer) clearTimeout(room.challengeTimer);
  room.botTimer = null;
  room.challengeTimer = null;
}

function schedule(room: Room) {
  clearTimers(room);
  if (!room.game || room.phase === "finished" || room.phase === "lobby") return;
  const g = room.game;
  const host = room.hostId;

  if ((g.game === "callBreak" || g.game === "mendi") && (g.phase === "holding" || g.phase === "showPower")) {
    const until = g.holdUntil ?? Date.now() + 3000;
    const kind = g.phase === "showPower" ? "table.advance" : "table.collect";
    room.botTimer = setTimeout(() => {
      const who = room.seats.find((s) => s.playerId)?.playerId ?? host;
      apply(room, who, { type: kind });
      emitRoom(room);
      emitLobby();
      schedule(room);
    }, Math.max(800, until - Date.now()));
    return;
  }

  if (g.game === "cabo" && g.phase === "showing") {
    const until = g.holdUntil ?? Date.now() + 2400;
    room.botTimer = setTimeout(() => {
      const who = room.seats.find((s) => s.playerId)?.playerId ?? host;
      apply(room, who, { type: "table.advance" });
      emitRoom(room);
      emitLobby();
      schedule(room);
    }, Math.max(800, until - Date.now()));
    return;
  }

  if (g.game === "bluff" && g.phase === "challenge") {
    const until = g.challengeUntil ?? Date.now() + 7000;
    room.challengeTimer = setTimeout(() => {
      if (!room.game || room.game.game !== "bluff" || room.game.phase !== "challenge") return;
      const names = room.seats.map((s) => s.name);
      room.game = resolveBluffTimeout(room.game, room.seats.length, names);
      if (room.game.phase === "over") room.phase = "finished";
      emitRoom(room);
      emitLobby();
      schedule(room);
    }, Math.max(200, until - Date.now()));

    const bots = room.seats.filter((s) => s.isBot && s.index !== g.lastPlay?.seat);
    for (const bot of bots) {
      setTimeout(() => {
        if (!room.game || room.game.game !== "bluff" || room.game.phase !== "challenge") return;
        const act = botAction(room.game, bot.index);
        if (act?.type === "bluff.call") {
          const res = apply(room, bot.playerId!, act);
          if (!res.error) {
            emitRoom(room);
            schedule(room);
          }
        }
      }, 700 + Math.random() * 2800);
    }
    return;
  }

  if (g.game === "callBreak" && g.phase === "roundEnd") {
    room.botTimer = setTimeout(() => {
      const actor = room.seats[g.currentSeat];
      apply(room, actor.playerId ?? room.hostId, { type: "callBreak.call", tricks: 1 });
      emitRoom(room);
      emitLobby();
      schedule(room);
    }, 2800);
    return;
  }

  if (g.game === "mendi" && g.phase === "handEnd") {
    room.botTimer = setTimeout(() => {
      const actor = room.seats[g.currentSeat];
      apply(room, actor.playerId ?? room.hostId, { type: "mendi.play", cardId: "x" });
      emitRoom(room);
      emitLobby();
      schedule(room);
    }, 3200);
    return;
  }

  if (g.game === "cabo" && g.phase === "peek") {
    const bots = room.seats.filter((s) => s.isBot && !g.peeked[s.index]);
    for (const bot of bots) {
      setTimeout(() => {
        if (!room.game || room.game.game !== "cabo" || room.game.phase !== "peek") return;
        apply(room, bot.playerId!, { type: "cabo.peekDone" });
        emitRoom(room);
        schedule(room);
      }, 900 + Math.random() * 1200);
    }
    return;
  }

  const actor = currentActor(room);
  if (!actor?.isBot || !actor.playerId || !room.game) return;
  const delay = 2000 + Math.random() * 1400;
  room.botTimer = setTimeout(() => {
    if (!room.game) return;
    const act = botAction(room.game, actor.index);
    if (!act) return;
    const res = apply(room, actor.playerId!, act);
    if (res.error && room.game.game === "bluff" && act.type === "bluff.play") {
      apply(room, actor.playerId!, { type: "bluff.pass" });
    }
    emitRoom(room);
    emitLobby();
    schedule(room);
  }, delay);
}

io.use((socket, next) => {
  try {
    const user = authUser(socket.handshake.auth?.token);
    socket.data.user = user;
    next();
  } catch (e) {
    next(new Error(e instanceof Error ? e.message : "auth"));
  }
});

io.on("connection", (socket) => {
  const user = socket.data.user as UserPublic;
  socket.join(`user:${user.id}`);
  socket.join("lobby");
  socket.emit("hello", { user, tables: roomsForLobby(), lobbyChat: getLobbyChat() });

  socket.on("lobby:chat", (text: string) => {
    if (typeof text !== "string" || !text.trim()) return;
    const msg = pushLobby(user, text.trim());
    io.to("lobby").emit("lobby:chat", msg);
  });

  socket.on("room:create", (config: RoomConfig, cb?: (res: unknown) => void) => {
    try {
      const room = createRoom(user, config);
      socket.join(`room:${room.id}`);
      cb?.({ ok: true, room: publicRoom(room, user.id) });
      emitLobby();
    } catch (e) {
      cb?.({ ok: false, error: e instanceof Error ? e.message : "Could not open a table." });
    }
  });

  socket.on("room:join", (payload: { code?: string; id?: string }, cb?: (res: unknown) => void) => {
    try {
      const room = payload.id ? getRoom(payload.id) : payload.code ? getRoomByCode(payload.code) : undefined;
      if (!room) throw new Error("No table with that code.");
      joinRoom(room, user);
      socket.join(`room:${room.id}`);
      emitRoom(room);
      emitLobby();
      cb?.({ ok: true, room: publicRoom(room, user.id) });
    } catch (e) {
      cb?.({ ok: false, error: e instanceof Error ? e.message : "Could not join." });
    }
  });

  socket.on("room:leave", (roomId: string) => {
    const room = getRoom(roomId);
    if (!room) return;
    leaveRoom(room, user.id);
    socket.leave(`room:${room.id}`);
    emitRoom(room);
    emitLobby();
    socket.emit("room:left");
  });

  socket.on("room:ready", (payload: { roomId: string; ready: boolean }) => {
    const room = getRoom(payload.roomId);
    if (!room) return;
    setReady(room, user.id, payload.ready);
    emitRoom(room);
  });

  socket.on("room:fillBots", (roomId: string) => {
    const room = getRoom(roomId);
    if (!room || room.hostId !== user.id) return;
    fillBots(room);
    emitRoom(room);
    emitLobby();
  });

  socket.on("room:start", (roomId: string, cb?: (res: unknown) => void) => {
    const room = getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: "Table gone." });
    if (room.hostId !== user.id) return cb?.({ ok: false, error: "Only the host can deal." });
    try {
      if (room.config.fillBots) fillBots(room);
      startGame(room);
      emitRoom(room);
      emitLobby();
      schedule(room);
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: e instanceof Error ? e.message : "Could not start." });
    }
  });

  socket.on("room:chat", (payload: { roomId: string; text: string; team?: boolean }) => {
    const room = getRoom(payload.roomId);
    if (!room || typeof payload.text !== "string") return;
    try {
      const msg = roomChat(room, user, payload.text.trim(), payload.team);
      emitRoom(room);
      if (msg.scope !== "team") io.to(`room:${room.id}`).emit("room:chat", msg);
    } catch {
      /* ignore */
    }
  });

  socket.on("game:action", (payload: { roomId: string; action: ClientAction }, cb?: (res: unknown) => void) => {
    const room = getRoom(payload.roomId);
    if (!room) return cb?.({ ok: false, error: "Table gone." });
    const res = apply(room, user.id, payload.action);
    if (res.error) return cb?.({ ok: false, error: res.error });
    emitRoom(room);
    emitLobby();
    schedule(room);
    cb?.({ ok: true });
  });

  socket.on("solo:start", (payload: { game: GameId; seats: number; trumpMode?: TrumpMode; callBreakRounds?: 3 | 5 }, cb?: (res: unknown) => void) => {
    try {
      const room = createRoom(user, {
        game: payload.game,
        seats: payload.seats,
        fillBots: true,
        trumpMode: payload.trumpMode,
        callBreakRounds: payload.callBreakRounds,
      });
      fillBots(room);
      room.seats[0].ready = true;
      startGame(room);
      socket.join(`room:${room.id}`);
      emitLobby();
      schedule(room);
      cb?.({ ok: true, room: publicRoom(room, user.id) });
    } catch (e) {
      cb?.({ ok: false, error: e instanceof Error ? e.message : "Could not start." });
    }
  });

  socket.on("disconnect", () => {
    for (const room of roomsForLobby()) {
      const r = getRoom(room.id);
      if (!r) continue;
      const seated = r.seats.some((s) => s.playerId === user.id);
      if (seated) {
        leaveRoom(r, user.id);
        emitRoom(r);
      }
    }
    emitLobby();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Baithak table open on :${PORT}`);
});
