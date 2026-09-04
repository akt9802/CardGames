import "./env.ts";
import express from "express";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type { ClientAction, GameId, RoomConfig, TrumpMode, UserPublic } from "../shared/types.ts";
import { completeSignup, completePasswordReset, getMe, getUser, issueSession, listPeople, login, refreshSession, requestPasswordReset, resendPasswordReset, revokeToken, savePhoto, updateProfile, userFromToken, verifyPasswordReset } from "./auth.ts";
import {
  adminFromToken,
  adminLogin,
  adminLogout,
  approveRequest,
  issueSignupOtp,
  listRequests,
  rejectRequest,
  requestAccess,
  verifySignupOtp,
} from "./access.ts";
import { notifyInvite, notifySeatTaken, notifyTableDealt, notifyTurnIfAway } from "./notify.ts";
import { createInvite, dismissInvite, invitesFor, persistInvitesNow } from "./invites.ts";
import { dropSubscription, pushConfigured, sendWebPush, upsertSubscription, vapidPublicKey } from "./push.ts";
import { photosDir } from "./store.ts";
import { botAction } from "./engine/bots.ts";
import { resolveBluffTimeout } from "./engine/bluff.ts";
import {
  apply,
  configureTable,
  createRoom,
  currentActor,
  fillBots,
  getLobbyChat,
  getRoom,
  getRoomByCode,
  isOnline,
  joinRoom,
  leaveRoom,
  listRooms,
  persistParlorNow,
  publicRoom,
  pushLobby,
  returnToLobby,
  roomChat,
  roomsForLobby,
  setReady,
  startGame,
  trackSocket,
  untrackSocket,
  type Room,
} from "./rooms.ts";

const app = express();
app.use(express.json({ limit: "2mb" }));

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

function bearer(req: { headers: { authorization?: string } }) {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : undefined;
}

function requireUser(req: { headers: { authorization?: string } }, res: express.Response) {
  const user = userFromToken(bearer(req));
  if (!user) {
    res.status(401).json({ error: "Sign in first." });
    return null;
  }
  return user;
}

app.post("/api/register", (_req, res) => {
  res.status(403).json({ error: "Access is by invitation. Request a chair first." });
});

app.post("/api/access/request", (req, res) => {
  try {
    const { name, email, reason } = req.body ?? {};
    requestAccess(String(name ?? ""), String(email ?? ""), String(reason ?? ""));
    res.json({ ok: true, detail: "Request submitted. We'll write if a chair opens." });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not submit." });
  }
});

app.post("/api/signup/request-otp", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "");
    const result = await issueSignupOtp(email, false);
    res.json({ ok: true, detail: "Verification code sent.", expires_in: result.expiresIn, otp: result.echo });
  } catch (e) {
    const retry = e && typeof e === "object" && "retryAfter" in e ? Number((e as { retryAfter: number }).retryAfter) : undefined;
    res.status(retry ? 429 : 400).json({ error: e instanceof Error ? e.message : "Could not send code.", retry_after: retry });
  }
});

app.post("/api/signup/resend-otp", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "");
    const result = await issueSignupOtp(email, true);
    res.json({ ok: true, detail: "A new verification code was sent.", expires_in: result.expiresIn, otp: result.echo });
  } catch (e) {
    const retry = e && typeof e === "object" && "retryAfter" in e ? Number((e as { retryAfter: number }).retryAfter) : undefined;
    res.status(retry ? 429 : 400).json({ error: e instanceof Error ? e.message : "Could not resend code.", retry_after: retry });
  }
});

app.post("/api/signup/verify-otp", (req, res) => {
  try {
    const setup_token = verifySignupOtp(String(req.body?.email ?? ""), String(req.body?.otp ?? ""));
    res.json({ ok: true, setup_token, detail: "Email verified. Set your chair." });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not verify." });
  }
});

app.post("/api/signup/complete", (req, res) => {
  try {
    const user = completeSignup(
      String(req.body?.setup_token ?? ""),
      String(req.body?.username ?? ""),
      String(req.body?.password ?? ""),
      String(req.body?.displayName ?? "")
    );
    res.json(issueSession(user.id));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not finish signup." });
  }
});

app.post("/api/login", (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    const user = login(String(username ?? ""), String(password ?? ""));
    res.json(issueSession(user.id));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not sign in." });
  }
});

app.post("/api/auth/refresh", (req, res) => {
  try {
    res.json(refreshSession(String(req.body?.refresh_token ?? "")));
  } catch (e) {
    res.status(401).json({ error: e instanceof Error ? e.message : "Session expired. Sign in again." });
  }
});

app.post("/api/password/request-otp", async (req, res) => {
  try {
    const loginId = String(req.body?.email ?? req.body?.username ?? req.body?.login ?? "");
    const result = await requestPasswordReset(loginId);
    res.json({
      ok: true,
      detail: "If that chair exists, we sent a code.",
      expires_in: result.expiresIn,
      otp: result.echo,
    });
  } catch (e) {
    const retry = e && typeof e === "object" && "retryAfter" in e ? Number((e as { retryAfter: number }).retryAfter) : undefined;
    res.status(retry ? 429 : 400).json({ error: e instanceof Error ? e.message : "Could not send code.", retry_after: retry });
  }
});

app.post("/api/password/resend-otp", async (req, res) => {
  try {
    const loginId = String(req.body?.email ?? req.body?.username ?? req.body?.login ?? "");
    const result = await resendPasswordReset(loginId);
    res.json({
      ok: true,
      detail: "If that chair exists, we sent a new code.",
      expires_in: result.expiresIn,
      otp: result.echo,
    });
  } catch (e) {
    const retry = e && typeof e === "object" && "retryAfter" in e ? Number((e as { retryAfter: number }).retryAfter) : undefined;
    res.status(retry ? 429 : 400).json({ error: e instanceof Error ? e.message : "Could not resend code.", retry_after: retry });
  }
});

app.post("/api/password/verify-otp", (req, res) => {
  try {
    const reset_token = verifyPasswordReset(
      String(req.body?.email ?? req.body?.username ?? req.body?.login ?? ""),
      String(req.body?.otp ?? "")
    );
    res.json({ ok: true, reset_token, detail: "Code verified. Choose a new password." });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not verify." });
  }
});

app.post("/api/password/reset", (req, res) => {
  try {
    res.json(completePasswordReset(String(req.body?.reset_token ?? ""), String(req.body?.password ?? "")));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not reset password." });
  }
});

app.post("/api/logout", (req, res) => {
  const token = bearer(req) ?? (typeof req.body?.token === "string" ? req.body.token : undefined);
  const refresh = typeof req.body?.refresh_token === "string" ? req.body.refresh_token : undefined;
  const user = userFromToken(token);
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (user && endpoint) dropSubscription(user.id, endpoint);
  revokeToken(token, refresh);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ user: getMe(user.id) });
});

app.post("/api/me", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const me = updateProfile(user.id, {
      displayName: req.body?.displayName,
      phone: req.body?.phone,
      instagram: req.body?.instagram,
    });
    res.json({ user: me });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not save." });
  }
});

app.post("/api/me/photo", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const me = savePhoto(user.id, String(req.body?.image ?? ""));
    res.json({ user: me });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not save photo." });
  }
});

app.get("/api/push/vapid", (_req, res) => {
  const key = vapidPublicKey();
  if (!key) return res.status(503).json({ error: "Push is not configured." });
  res.json({ publicKey: key });
});

app.post("/api/push/subscribe", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    upsertSubscription(user.id, req.body ?? {});
    res.json({ ok: true, detail: "Subscribed successfully." });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not subscribe." });
  }
});

app.post("/api/push/unsubscribe", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  dropSubscription(user.id, String(req.body?.endpoint ?? ""));
  res.json({ ok: true, detail: "Unsubscribed successfully." });
});

app.post("/api/push/test", async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  if (!pushConfigured()) return res.status(503).json({ error: "Push is not configured." });
  await sendWebPush(user.id, "Baithak", "The parlor can reach this chair.", "/lobby");
  res.json({ ok: true });
});

app.get("/api/people", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({
    people: listPeople().map((p) => ({ ...p, online: isOnline(p.id), self: p.id === user.id })),
  });
});

app.get("/api/people/:id", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const person = getUser(req.params.id);
  if (!person) {
    res.status(404).json({ error: "No chair with that name." });
    return;
  }
  res.json({ user: { ...person, online: isOnline(person.id), self: person.id === user.id } });
});

app.get("/api/invites", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ invites: invitesFor(user.id) });
});

app.post("/api/invites/:id/dismiss", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  dismissInvite(req.params.id, user.id);
  res.json({ ok: true });
});

app.post("/api/people/:id/ping", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const roomId = typeof req.body?.roomId === "string" ? req.body.roomId : "";
    const room = roomId ? getRoom(roomId) : undefined;
    const invite = createInvite("ping", user, req.params.id, room ? { id: room.id, code: room.code } : undefined);
    notifyInvite(invite);
    io.to(`user:${invite.toId}`).emit("invite:incoming", invite);
    res.json({ ok: true, invite });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not ping." });
  }
});

app.post("/api/rooms/:id/invite", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const room = getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: "No such table." });
  const seated = room.seats.some((s) => s.playerId === user.id);
  if (!seated && room.hostId !== user.id) return res.status(403).json({ error: "Sit first, then invite." });
  const ids = Array.isArray(req.body?.userIds) ? req.body.userIds.map(String) : [];
  const sent = [];
  try {
    for (const id of ids) {
      if (room.seats.some((s) => s.playerId === id)) continue;
      const invite = createInvite("invite", user, id, { id: room.id, code: room.code });
      notifyInvite(invite);
      io.to(`user:${invite.toId}`).emit("invite:incoming", invite);
      sent.push(invite);
    }
    res.json({ ok: true, sent: sent.length });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not invite." });
  }
});

app.post("/api/admin/login", (req, res) => {
  try {
    const token = adminLogin(String(req.body?.username ?? ""), String(req.body?.password ?? ""));
    res.json({ token });
  } catch (e) {
    res.status(401).json({ error: e instanceof Error ? e.message : "No." });
  }
});

app.post("/api/admin/logout", (req, res) => {
  const token = bearer(req);
  if (token) adminLogout(token);
  res.json({ ok: true });
});

app.get("/api/admin/requests", (req, res) => {
  if (!adminFromToken(bearer(req))) return res.status(401).json({ error: "Sign in at the door." });
  const status = req.query.status;
  const filter = status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? status : undefined;
  res.json({
    requests: listRequests(filter).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      reason: r.reason,
      status: r.status,
      rejectionReason: r.rejectionReason,
      signupCompleted: Boolean(r.userId),
      createdAt: r.createdAt,
    })),
  });
});

app.post("/api/admin/requests/:id/approve", async (req, res) => {
  if (!adminFromToken(bearer(req))) return res.status(401).json({ error: "Sign in at the door." });
  try {
    const rec = await approveRequest(req.params.id);
    res.json({ ok: true, id: rec.id });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not approve." });
  }
});

app.post("/api/admin/requests/:id/reject", (req, res) => {
  if (!adminFromToken(bearer(req))) return res.status(401).json({ error: "Sign in at the door." });
  try {
    const rec = rejectRequest(req.params.id, String(req.body?.reason ?? ""));
    res.json({ ok: true, id: rec.id });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not reject." });
  }
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    res.status(404).json({ error: "That door does not exist." });
    return;
  }
  next();
});

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
app.use("/photos", express.static(photosDir(), { maxAge: "7d" }));
app.use(express.static(dist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/socket.io") || req.path.startsWith("/photos")) return next();
  res.sendFile(join(dist, "index.html"), (err) => {
    if (err) next();
  });
});

function emitRoom(room: Room) {
  for (const seat of room.seats) {
    if (!seat.playerId || seat.isBot) continue;
    io.to(`user:${seat.playerId}`).emit("room:state", publicRoom(room, seat.playerId));
  }
  notifyTurnIfAway(room);
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
      persistParlorNow();
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
  trackSocket(user.id, socket.id);
  socket.join(`user:${user.id}`);
  socket.join("lobby");
  socket.emit("hello", { user, tables: roomsForLobby(), lobbyChat: getLobbyChat(), invites: invitesFor(user.id) });

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
      const byId = typeof payload.id === "string" && payload.id.trim();
      const byCode = typeof payload.code === "string" && payload.code.trim();
      const room = byId ? getRoom(byId) : byCode ? getRoomByCode(byCode) : undefined;
      if (!room) {
        if (byId) throw new Error("This table no longer exists.");
        if (byCode) throw new Error("No table with that code.");
        throw new Error("Need a table code or a link.");
      }
      joinRoom(room, user);
      socket.join(`room:${room.id}`);
      emitRoom(room);
      emitLobby();
      notifySeatTaken(room, user.displayName, room.hostId, user.id);
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

  socket.on("room:configure", (payload: { roomId: string } & Partial<RoomConfig>, cb?: (res: unknown) => void) => {
    const room = getRoom(payload.roomId);
    if (!room) return cb?.({ ok: false, error: "Table gone." });
    if (room.hostId !== user.id) return cb?.({ ok: false, error: "Only the host can set the table." });
    try {
      configureTable(room, payload);
      emitRoom(room);
      emitLobby();
      cb?.({ ok: true, room: publicRoom(room, user.id) });
    } catch (e) {
      cb?.({ ok: false, error: e instanceof Error ? e.message : "Could not set the table." });
    }
  });

  socket.on("room:again", (roomId: string, cb?: (res: unknown) => void) => {
    const room = getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: "Table gone." });
    if (room.hostId !== user.id) return cb?.({ ok: false, error: "Only the host can deal the next sitting." });
    if (room.phase === "playing" && room.game && room.game.phase !== "over") {
      return cb?.({ ok: false, error: "This sitting is still going." });
    }
    clearTimers(room);
    returnToLobby(room);
    emitRoom(room);
    emitLobby();
    cb?.({ ok: true, room: publicRoom(room, user.id) });
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
      notifyTableDealt(room);
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
    untrackSocket(user.id, socket.id);
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

function flushParlor() {
  persistParlorNow();
  persistInvitesNow();
}

process.on("SIGTERM", () => {
  flushParlor();
  process.exit(0);
});
process.on("SIGINT", () => {
  flushParlor();
  process.exit(0);
});

httpServer.listen(PORT, () => {
  console.log(`Baithak table open on :${PORT}`);
  for (const room of listRooms()) {
    if (room.phase === "playing") schedule(room);
  }
});
