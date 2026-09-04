import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GAME_META, type GameId, type RoomPublic, type TrumpMode } from "@shared/types.ts";
import { ChatPanel } from "../components/ChatPanel.tsx";
import { BrandMark } from "../components/BrandMark.tsx";
import { InviteInbox } from "../components/InviteInbox.tsx";
import { RulesRail } from "../components/RulesRail.tsx";
import { connect, emit, loadSession } from "../session.ts";
import { instagramUrl } from "../instagram.ts";
import { Missing } from "./Missing.tsx";

export function RoomLobby() {
  const { id } = useParams();
  const nav = useNavigate();
  const session = loadSession()!;
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [err, setErr] = useState("");
  const [missing, setMissing] = useState("");

  useEffect(() => {
    const s = connect(session.token);
    const join = () => {
      s.emit("room:join", { id }, (res: { ok: boolean; error?: string; room?: RoomPublic }) => {
        if (!res.ok || !res.room) setMissing(res.error ?? "This table no longer exists.");
        else {
          setMissing("");
          setRoom(res.room);
        }
      });
    };
    s.on("connect", join);
    if (s.connected) join();
    const onState = (r: RoomPublic) => {
      setRoom(r);
      setMissing("");
      if (r.phase === "playing" || r.phase === "finished") nav(`/play/${r.id}`, { replace: true });
    };
    s.on("room:state", onState);
    return () => {
      s.off("connect", join);
      s.off("room:state", onState);
    };
  }, [id, session.token, nav]);

  if (missing) {
    const gone = missing === "This table no longer exists.";
    return (
      <Missing
        kicker="No table"
        title={gone ? "This table no longer exists" : missing}
        detail={
          gone
            ? "That sitting is not on this parlor anymore. Open a new table, or join with a live code."
            : "You can still go back to the hall and sit at another table."
        }
      />
    );
  }
  if (!room) return <div className="room-hero">Finding the table…</div>;

  const game = room.config.game;
  const meta = game ? GAME_META[game] : null;
  const you = room.seats.find((s) => s.playerId === session.user.id);
  const host = room.hostId === session.user.id;
  const seatChoices = meta ? meta.seatOptions : [2, 3, 4, 5, 6, 7, 8];

  async function configure(patch: Record<string, unknown>) {
    if (!room) return;
    const res = await emit<{ ok: boolean; error?: string }>("room:configure", { roomId: room.id, ...patch });
    if (!res.ok) setErr(res.error ?? "Could not set the table");
  }

  return (
    <>
      <header className="topbar">
        <Link className="mark" to="/lobby">
          <BrandMark kicker={`${meta?.title ?? "Open table"} · ${room.code}`} />
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn" to={`/people?table=${room.id}`}>
            Invite
          </Link>
          <button className="btn ghost" type="button" onClick={() => emit("room:leave", room.id).then(() => nav("/lobby"))}>
            Leave
          </button>
        </div>
      </header>
      <div className="lobby">
        <div className="room-hero" style={{ padding: 0 }}>
          <InviteInbox />
          <div className="kicker">Room {room.code}</div>
          <h1 className="display" style={{ fontSize: 44 }}>
            {meta?.title ?? "The table is open"}
          </h1>
          <p style={{ color: "var(--mist)" }}>
            {room.config.seats} chairs. Deal any of the four games from this sitting. After a hand, come back here and
            pick another.
          </p>
          {host ? (
            <div className="create" style={{ marginBottom: 16 }}>
              <div className="field">
                <label>Tonight's game</label>
                <select
                  value={game ?? ""}
                  onChange={(e) => configure({ game: (e.target.value || null) as GameId | null })}
                >
                  <option value="">Pick when you deal</option>
                  {Object.entries(GAME_META).map(([id, g]) => (
                    <option key={id} value={id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Chairs</label>
                <select value={room.config.seats} onChange={(e) => configure({ seats: Number(e.target.value) })}>
                  {seatChoices.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              {game === "callBreak" || game === "mendi" ? (
                <div className="field">
                  <label>Trump</label>
                  <select
                    value={room.config.trumpMode ?? "classic"}
                    onChange={(e) => configure({ trumpMode: e.target.value as TrumpMode })}
                  >
                    <option value="classic">
                      {game === "callBreak" ? "Classic — Spades always trump" : "Closed — tucked card"}
                    </option>
                    <option value="power">Power card</option>
                    <option value="cut">Cut</option>
                  </select>
                </div>
              ) : null}
              {game === "callBreak" ? (
                <div className="field">
                  <label>Deals</label>
                  <select
                    value={room.config.callBreakRounds ?? 5}
                    onChange={(e) => configure({ callBreakRounds: Number(e.target.value) as 3 | 5 })}
                  >
                    <option value={3}>3 rounds</option>
                    <option value={5}>5 rounds</option>
                  </select>
                </div>
              ) : null}
              <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--mist)", fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={room.config.fillBots}
                  onChange={(e) => configure({ fillBots: e.target.checked })}
                />
                Fill empty chairs with computers
              </label>
            </div>
          ) : (
            <p style={{ color: "var(--mist)" }}>
              {game ? `${meta?.title} is queued.` : "The host will pick a game before dealing."}
            </p>
          )}
          <div className="wait-grid">
            {room.seats.map((s) => (
              <div className="seat-card" key={s.index}>
                <div className="seat-card-who">
                  <span className="mini-portrait">
                    {s.photoUrl ? <img src={s.photoUrl} alt="" /> : (s.name || "?").slice(0, 1)}
                  </span>
                  <div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--mist)" }}>
                      {s.team ? `Team ${s.team}` : `Seat ${s.index + 1}`}
                    </div>
                    <div className="nm">{s.name}</div>
                    {s.instagram ? (
                      <a
                        className="ig-out"
                        href={instagramUrl(s.instagram)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        @{s.instagram}
                      </a>
                    ) : null}
                  </div>
                </div>
                <div style={{ color: s.ready ? "var(--brass-2)" : "var(--mist)", fontSize: 12 }}>
                  {s.playerId ? (s.ready ? "Ready" : "Settling in") : "Waiting"}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              onClick={() => connect(session.token).emit("room:ready", { roomId: room.id, ready: !you?.ready })}
            >
              {you?.ready ? "Unready" : "Ready"}
            </button>
            {host ? (
              <>
                <button className="btn" type="button" onClick={() => connect(session.token).emit("room:fillBots", room.id)}>
                  Seat computers
                </button>
                <button
                  className="btn solid"
                  type="button"
                  onClick={async () => {
                    const res = await emit<{ ok: boolean; error?: string }>("room:start", room.id);
                    if (!res.ok) setErr(res.error ?? "Could not deal");
                  }}
                >
                  Deal
                </button>
              </>
            ) : (
              <span style={{ color: "var(--mist)", alignSelf: "center" }}>Host deals when everyone is ready.</span>
            )}
          </div>
          <div className="err">{err}</div>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <ChatPanel
            messages={room.chat}
            teamEnabled={Boolean(meta?.teams)}
            onSend={(text, team) => connect(session.token).emit("room:chat", { roomId: room.id, text, team })}
          />
          {game ? <RulesRail game={game} /> : null}
        </div>
      </div>
    </>
  );
}
