import type { Seat } from "@shared/types.ts";
import { Link } from "react-router-dom";

export function ringStyle(index: number, count: number, youSeat: number, radius: number, youY?: number) {
  const rel = (index - youSeat + count) % count;
  const angle = (rel / count) * Math.PI * 2 + Math.PI / 2;
  const r = rel === 0 ? (youY != null ? 0 : radius * 0.72) : radius;
  const x = 50 + Math.cos(angle) * r;
  const y = rel === 0 && youY != null ? youY : 42 + Math.sin(angle) * (radius * 0.78);
  return { left: `${x}%`, top: `${y}%` };
}

export function seatStyle(index: number, count: number, youSeat: number) {
  return ringStyle(index, count, youSeat, 38, 74);
}

export function trickStyle(index: number, count: number, youSeat: number) {
  const rel = (index - youSeat + count) % count;
  const angle = (rel / count) * Math.PI * 2 + Math.PI / 2;
  const radius = 19;
  const x = 50 + Math.cos(angle) * radius;
  const y = 40 + Math.sin(angle) * (radius * 0.72);
  return { left: `${x}%`, top: `${y}%` };
}

export function Seats({
  seats,
  youSeat,
  turnSeat,
  turnLabel = "to play",
  wonSeats,
}: {
  seats: Seat[];
  youSeat: number;
  turnSeat: number | null;
  turnLabel?: string;
  wonSeats?: number[];
}) {
  const won = new Set(wonSeats ?? []);
  return (
    <>
      {seats.map((s) => {
        const isTurn = turnSeat === s.index;
        return (
          <div
            key={s.index}
            className={[
              "seat",
              s.index === youSeat ? "you" : "",
              isTurn ? "turn" : "",
              won.has(s.index) ? "won" : "",
              s.team === "A" ? "teamA" : s.team === "B" ? "teamB" : "",
            ].join(" ")}
            style={seatStyle(s.index, seats.length, youSeat)}
          >
            <div className="bubble">
              {s.photoUrl ? <img src={s.photoUrl} alt="" /> : s.name.slice(0, 1)}
            </div>
            {isTurn ? <div className="turn-tag">{s.index === youSeat ? "your turn" : "turn"}</div> : null}
            <div className="nameplate">
              <div className="who">
              {s.index === youSeat
                ? "You"
                : s.playerId && !s.isBot
                  ? (
                    <Link className="quiet-link" to={`/people/${s.playerId}`}>
                      {s.name}
                    </Link>
                  )
                  : s.name}
              {s.isBot ? " · cpu" : ""}
            </div>
              {s.instagram && s.index !== youSeat ? <div className="ig">@{s.instagram}</div> : null}
              <div className="meta">
                {isTurn
                  ? turnLabel
                  : s.team
                    ? `Team ${s.team}`
                    : won.has(s.index)
                      ? "took the trick"
                      : `Seat ${s.index + 1}`}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
