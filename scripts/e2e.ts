import { io } from "socket.io-client";

const API = "http://localhost:3001";
const ADMIN_USER = "zakAddKK";
const ADMIN_PASS = "12qw!@QWzak765";

async function json<T = any>(path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `${path} failed`);
  return data as T;
}

async function signupPlayer(username: string) {
  const email = `${username}@e2e.local`;
  await json("/api/access/request", {
    name: username,
    email,
    reason: "e2e table seating test — need a chair to run the suite",
  });
  const admin = await json<{ token: string }>("/api/admin/login", {
    username: ADMIN_USER,
    password: ADMIN_PASS,
  });
  const list = await json<{ requests: { id: string; email: string }[] }>(
    "/api/admin/requests?status=PENDING",
    undefined,
    admin.token
  );
  const rec = list.requests.find((r) => r.email === email);
  if (!rec) throw new Error("access request missing");
  await json(`/api/admin/requests/${rec.id}/approve`, {}, admin.token);
  const otpRes = await json<{ otp?: string }>("/api/signup/request-otp", { email });
  if (!otpRes.otp) throw new Error("expected echoed otp when SMTP is unset");
  const ver = await json<{ setup_token: string }>("/api/signup/verify-otp", { email, otp: otpRes.otp });
  return json<{ token: string; refresh_token: string; expires_in: number; user: { id: string; username: string } }>(
    "/api/signup/complete",
    {
      setup_token: ver.setup_token,
      username,
      password: "pass",
      displayName: username,
    }
  );
}

function once(socket: ReturnType<typeof io>, ev: string, timeout = 8000) {
  return new Promise<unknown>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ev}`)), timeout);
    socket.once(ev, (msg) => {
      clearTimeout(t);
      resolve(msg);
    });
  });
}

async function run() {
  const a = await signupPlayer("e2e_a_" + Math.floor(Math.random() * 9999));
  const b = await signupPlayer("e2e_b_" + Math.floor(Math.random() * 9999));
  if (!a.refresh_token || !a.expires_in) throw new Error("signup must return refresh_token");

  const refreshed = await json<{ token: string; refresh_token: string; user: { id: string } }>("/api/auth/refresh", {
    refresh_token: a.refresh_token,
  });
  if (!refreshed.token || refreshed.token === a.token) throw new Error("refresh should mint a new access token");
  a.token = refreshed.token;
  const oldRefresh = a.refresh_token;
  a.refresh_token = refreshed.refresh_token;
  try {
    await json("/api/auth/refresh", { refresh_token: oldRefresh });
    throw new Error("rotated refresh must fail");
  } catch (e) {
    if (!(e instanceof Error) || e.message === "rotated refresh must fail") throw e;
  }

  const chair = await json<{ user: { id: string; username: string; email?: string; phone?: string; self: boolean } }>(
    `/api/people/${b.user.id}`,
    undefined,
    a.token
  );
  if (chair.user.id !== b.user.id) throw new Error("public profile id mismatch");
  if (chair.user.email || chair.user.phone) throw new Error("public profile must hide email and phone");

  const unknown = await json<{ otp?: string }>("/api/password/request-otp", { email: "nobody-e2e@example.com" });
  if (unknown.otp) throw new Error("unknown chair must not echo an otp");

  const resetReq = await json<{ otp?: string }>("/api/password/request-otp", { email: `${b.user.username}@e2e.local` });
  if (!resetReq.otp) throw new Error("expected echoed reset otp when SMTP is unset");
  const resetVer = await json<{ reset_token: string }>("/api/password/verify-otp", {
    email: b.user.username,
    otp: resetReq.otp,
  });
  const resetSession = await json<{ token: string; refresh_token: string }>("/api/password/reset", {
    reset_token: resetVer.reset_token,
    password: "pass2",
  });
  if (!resetSession.refresh_token) throw new Error("reset must sign in with refresh");
  b.token = resetSession.token;

  const sa = io(API, { auth: { token: a.token } });
  const sb = io(API, { auth: { token: b.token } });
  await Promise.all([once(sa, "hello"), once(sb, "hello")]);

  const created = await new Promise<any>((resolve) =>
    sa.emit("room:create", { game: "mendi", seats: 4, fillBots: true }, resolve)
  );
  if (!created.ok) throw new Error(created.error);
  const roomId = created.room.id;
  const code = created.room.code;
  const joined = await new Promise<any>((resolve) => sb.emit("room:join", { code }, resolve));
  if (!joined.ok) throw new Error(joined.error);

  const teams = joined.room.seats.map((s: any) => `${s.name}:${s.team}`).join(", ");
  console.log("mendi lobby", code, teams);

  sa.emit("room:ready", { roomId, ready: true });
  sb.emit("room:ready", { roomId, ready: true });
  sa.emit("room:chat", { roomId, text: "hallo table" });
  sb.emit("room:chat", { roomId, text: "partners?", team: true });
  await new Promise((r) => setTimeout(r, 200));

  const started = await new Promise<any>((resolve) => sa.emit("room:start", roomId, resolve));
  if (!started.ok) throw new Error(started.error);

  const playing = await new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("no play state")), 5000);
    sa.on("room:state", (r) => {
      if (r.phase === "playing" && r.game) {
        clearTimeout(t);
        resolve(r);
      }
    });
  });
  const you = playing.youSeat;
  const partner = playing.seats.find((s: any) => s.team === playing.seats[you].team && s.index !== you);
  console.log("mendi playing, you", playing.seats[you].name, "partner", partner?.name, "bot?", partner?.isBot);
  console.log("team chat visible", playing.chat.filter((m: any) => m.scope === "team").map((m: any) => m.text));
  console.log("table chat", playing.chat.filter((m: any) => m.scope === "room").map((m: any) => m.text));

  const solo = await new Promise<any>((resolve) =>
    sa.emit("solo:start", { game: "callBreak", seats: 8 }, resolve)
  );
  if (!solo.ok) throw new Error(solo.error);
  console.log("callBreak 8 solo", solo.room.config.seats, "decks", solo.room.game.decks, "hands", Object.values(solo.room.game.hands).map((h: any) => h.length));

  const bluff = await new Promise<any>((resolve) =>
    sa.emit("solo:start", { game: "bluff", seats: 3 }, resolve)
  );
  console.log("bluff 3 solo phase", bluff.room.game.phase, "hand", bluff.room.game.hands[0].length);

  await json("/api/logout", { token: a.token, refresh_token: a.refresh_token }, a.token);

  sa.close();
  sb.close();
  console.log("socket e2e ok");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
