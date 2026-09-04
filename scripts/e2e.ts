import { io } from "socket.io-client";

const API = "http://localhost:3001";

async function register(username: string) {
  const res = await fetch(`${API}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "pass", displayName: username }),
  });
  const data = await res.json();
  if (!res.ok) {
    const login = await fetch(`${API}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "pass" }),
    });
    return login.json();
  }
  return data;
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
  const a = await register("e2e_a_" + Math.floor(Math.random() * 9999));
  const b = await register("e2e_b_" + Math.floor(Math.random() * 9999));
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

  sa.close();
  sb.close();
  console.log("socket e2e ok");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
