import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GAME_META, type GameId, type ChatMessage, type TrumpMode } from "@shared/types.ts";
import { ChatPanel } from "../components/ChatPanel.tsx";
import { BrandMark } from "../components/BrandMark.tsx";
import { InviteInbox } from "../components/InviteInbox.tsx";
import {
  connect,
  emit,
  loadSession,
  logout,
  type Hello,
  type LobbyTable,
} from "../session.ts";

export function Lobby() {
  const nav = useNavigate();
  const session = loadSession()!;
  const [tables, setTables] = useState<LobbyTable[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [game, setGame] = useState<GameId>("bluff");
  const meta = GAME_META[game];
  const [seats, setSeats] = useState(8);
  const [soloSeats, setSoloSeats] = useState(meta.seatOptions[0]);
  const [code, setCode] = useState("");
  const [fillBots, setFillBots] = useState(true);
  const [trumpMode, setTrumpMode] = useState<TrumpMode>("classic");
  const [rounds, setRounds] = useState<3 | 5>(5);
  const [err, setErr] = useState("");

  useEffect(() => {
    const s = connect(session.token);
    const onHello = (h: Hello) => {
      setTables(h.tables);
      setChat(h.lobbyChat);
    };
    s.on("hello", onHello);
    s.on("lobby:tables", setTables);
    s.on("lobby:chat", (m: ChatMessage) => setChat((c) => [...c, m].slice(-80)));
    return () => {
      s.off("hello", onHello);
      s.off("lobby:tables", setTables);
    };
  }, [session.token]);

  useEffect(() => {
    setSoloSeats(GAME_META[game].seatOptions[0]);
  }, [game]);

  const open = useMemo(() => tables, [tables]);

  async function create() {
    setErr("");
    const res = await emit<{ ok: boolean; error?: string; room?: { id: string } }>("room:create", {
      seats,
      fillBots,
    });
    if (!res.ok || !res.room) return setErr(res.error ?? "Could not open table");
    nav(`/table/${res.room.id}`);
  }

  async function join() {
    setErr("");
    const res = await emit<{ ok: boolean; error?: string; room?: { id: string } }>("room:join", { code });
    if (!res.ok || !res.room) return setErr(res.error ?? "No table");
    nav(`/table/${res.room.id}`);
  }

  async function solo() {
    setErr("");
    const res = await emit<{ ok: boolean; error?: string; room?: { id: string } }>("solo:start", {
      game,
      seats: soloSeats,
      trumpMode,
      callBreakRounds: rounds,
    });
    if (!res.ok || !res.room) return setErr(res.error ?? "Could not start");
    nav(`/play/${res.room.id}`);
  }

  return (
    <>
      <header className="topbar">
        <Link className="mark" to="/">
          <BrandMark kicker={session.user.displayName} />
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn solid" to="/people">
            People
          </Link>
          <Link className="btn" to="/profile">
            Profile
          </Link>
          <button
            className="btn ghost"
            type="button"
            onClick={async () => {
              await logout();
              nav("/");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="lobby">
        <div>
          <InviteInbox />
          <div className="kicker">The hall</div>
          <h1 className="display" style={{ fontSize: 48, marginBottom: 18 }}>
            Open a table or sit at one already burning.
          </h1>
          <div className="create">
            <p style={{ color: "var(--mist)", marginTop: 0 }}>
              A table is a sitting, not a single game. Invite people, then deal Bluff, Call Break, Mendi, or Cabo — and
              another after that.
            </p>
            <div className="field">
              <label>Chairs</label>
              <select value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} chairs
                  </option>
                ))}
              </select>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--mist)", fontSize: 14 }}>
              <input type="checkbox" checked={fillBots} onChange={(e) => setFillBots(e.target.checked)} />
              Fill empty chairs with computers when you deal
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn solid" onClick={create} type="button">
                Open table
              </button>
              <Link className="btn" to="/people">
                Invite from the hall
              </Link>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                className="mono"
                placeholder="ROOM CODE"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                style={{
                  flex: 1,
                  background: "var(--ink)",
                  border: "1px solid var(--line)",
                  color: "var(--ivory)",
                  padding: "10px 12px",
                  letterSpacing: "0.2em",
                }}
              />
              <button className="btn" onClick={join} type="button">
                Join
              </button>
            </div>
            <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />
            <div className="kicker">Solo vs computers</div>
            <div className="field">
              <label>Game</label>
              <select value={game} onChange={(e) => setGame(e.target.value as GameId)}>
                {Object.entries(GAME_META).map(([id, g]) => (
                  <option key={id} value={id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Chairs</label>
              <select value={soloSeats} onChange={(e) => setSoloSeats(Number(e.target.value))}>
                {meta.seatOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} players{meta.teams ? " · teams" : ""}
                    {idNote(game, n)}
                  </option>
                ))}
              </select>
            </div>
            {game === "callBreak" || game === "mendi" ? (
              <div className="field">
                <label>Trump</label>
                <select value={trumpMode} onChange={(e) => setTrumpMode(e.target.value as TrumpMode)}>
                  <option value="classic">
                    {game === "callBreak" ? "Classic — Spades always trump" : "Closed — tucked card, revealed on first void"}
                  </option>
                  <option value="power">Power card — a random card is cut; that suit is trump</option>
                  <option value="cut">Cut — first player who cannot follow sets trump</option>
                </select>
              </div>
            ) : null}
            {game === "callBreak" ? (
              <div className="field">
                <label>Deals</label>
                <select value={rounds} onChange={(e) => setRounds(Number(e.target.value) as 3 | 5)}>
                  <option value={3}>3 rounds</option>
                  <option value={5}>5 rounds</option>
                </select>
              </div>
            ) : null}
            <button className="btn" onClick={solo} type="button">
              Play alone vs computers
            </button>
            <div className="err">{err}</div>
          </div>
          <div className="tables">
            {open.length === 0 ? (
              <p style={{ color: "var(--mist)" }}>No open tables. Start one — computers will keep you company.</p>
            ) : (
              open.map((t) => (
                <div className="table-row" key={t.id}>
                  <div>
                    <strong>{t.game ? GAME_META[t.game].title : "Open table"}</strong>
                    <div className="mono" style={{ color: "var(--mist)", fontSize: 12 }}>
                      {t.code} · {t.filled}/{t.seats} · {t.phase === "finished" ? "between games" : t.phase}
                    </div>
                  </div>
                  <button className="btn" type="button" onClick={() => nav(`/table/${t.id}`)}>
                    Sit
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Hall chat</h2>
          <ChatPanel
            messages={chat}
            roomLabel="Hall"
            onSend={(text) => {
              connect(session.token).emit("lobby:chat", text);
            }}
          />
        </div>
      </div>
    </>
  );
}

function idNote(game: GameId, n: number) {
  if (game === "callBreak" && n === 8) return " · two decks";
  if (game === "mendi" && n === 6) return " · 3v3";
  if (game === "bluff" && n >= 6) return " · two decks";
  return "";
}
