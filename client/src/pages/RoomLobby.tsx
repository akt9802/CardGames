import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GAME_META, type RoomPublic } from "@shared/types.ts";
import { ChatPanel } from "../components/ChatPanel.tsx";
import { RulesRail } from "../components/RulesRail.tsx";
import { connect, emit, loadSession } from "../session.ts";

export function RoomLobby() {
  const { id } = useParams();
  const nav = useNavigate();
  const session = loadSession()!;
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const s = connect(session.token);
    s.emit("room:join", { id }, (res: { ok: boolean; error?: string; room?: RoomPublic }) => {
      if (!res.ok || !res.room) setErr(res.error ?? "Could not join");
      else setRoom(res.room);
    });
    const onState = (r: RoomPublic) => {
      setRoom(r);
      if (r.phase === "playing" || r.phase === "finished") nav(`/play/${r.id}`, { replace: true });
    };
    s.on("room:state", onState);
    return () => {
      s.off("room:state", onState);
    };
  }, [id, session.token, nav]);

  if (err) {
    return (
      <div className="room-hero">
        <p>{err}</p>
        <Link to="/lobby">Back to lobby</Link>
      </div>
    );
  }
  if (!room) return <div className="room-hero">Finding the table…</div>;

  const meta = GAME_META[room.config.game];
  const you = room.seats.find((s) => s.playerId === session.user.id);
  const host = room.hostId === session.user.id;

  return (
    <>
      <header className="topbar">
        <Link className="mark" to="/lobby">
          <span className="ring">♠</span>
          <div>
            <strong>Baithak</strong>
            <span>
              {meta.title} · {room.code}
            </span>
          </div>
        </Link>
        <button className="btn ghost" type="button" onClick={() => emit("room:leave", room.id).then(() => nav("/lobby"))}>
          Leave
        </button>
      </header>
      <div className="lobby">
        <div className="room-hero" style={{ padding: 0 }}>
          <div className="kicker">Room {room.code}</div>
          <h1 className="display" style={{ fontSize: 44 }}>
            {meta.title}
          </h1>
          <p style={{ color: "var(--mist)" }}>
            {room.config.seats} chairs
            {room.config.game === "callBreak" ? ` · ${room.config.callBreakRounds ?? 5} deals` : ""}
            {room.config.trumpMode && room.config.game !== "bluff" && room.config.game !== "cabo"
              ? ` · trump ${room.config.trumpMode}`
              : ""}
            . Share the code so friends can sit. Empty seats become computers when you deal.
          </p>
          <div className="wait-grid">
            {room.seats.map((s) => (
              <div className="seat-card" key={s.index}>
                <div className="mono" style={{ fontSize: 11, color: "var(--mist)" }}>
                  {s.team ? `Team ${s.team}` : `Seat ${s.index + 1}`}
                </div>
                <div className="nm">{s.name}</div>
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
            teamEnabled={meta.teams}
            onSend={(text, team) => connect(session.token).emit("room:chat", { roomId: room.id, text, team })}
          />
          <RulesRail game={room.config.game} />
        </div>
      </div>
    </>
  );
}
