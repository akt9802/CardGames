import { Link } from "react-router-dom";
import { GAME_META } from "@shared/types.ts";
import { PlayingCard } from "../components/PlayingCard.tsx";
import { loadSession } from "../session.ts";

export function Landing() {
  const in_ = loadSession();
  return (
    <>
      <header className="topbar">
        <a className="mark" href="/">
          <span className="ring">♠</span>
          <div>
            <strong>Baithak</strong>
            <span>late sitting, four games</span>
          </div>
        </a>
        <div style={{ display: "flex", gap: 8 }}>
          {in_ ? (
            <Link className="btn solid" to="/lobby">
              Enter lobby
            </Link>
          ) : (
            <>
              <Link className="btn" to="/login">
                Sign in
              </Link>
              <Link className="btn solid" to="/register">
                Take a seat
              </Link>
            </>
          )}
        </div>
      </header>
      <section className="hero">
        <div>
          <div className="kicker">A parlor, not a casino</div>
          <h1>Four tables. One night.</h1>
          <p className="lede">
            Bluff until someone flinches. Call your tricks in Call Break — Spades, a power-card cut, or a live cut, in 3
            or 5 deals. Hunt tens in Mendi Coat. Remember four cards in Cabo. Computers fill empty chairs. Rooms open
            with a five-letter code.
          </p>
          <div className="hero-actions">
            <Link className="btn solid" to={in_ ? "/lobby" : "/register"}>
              Sit down
            </Link>
            <Link className="btn" to="/lobby">
              Join a room
            </Link>
          </div>
        </div>
        <div className="fan" aria-hidden>
          {[
            { id: "1", suit: "S" as const, rank: "A" as const },
            { id: "2", suit: "H" as const, rank: "10" as const },
            { id: "3", suit: "D" as const, rank: "K" as const },
            { id: "4", suit: "C" as const, rank: "Q" as const },
            { id: "5", suit: "S" as const, rank: "7" as const },
          ].map((c, i) => (
            <div key={c.id} className="card-slot" style={{ transform: `translateX(-50%) rotate(${(i - 2) * 14}deg)` }}>
              <PlayingCard card={c} />
            </div>
          ))}
        </div>
      </section>
      <section className="game-grid">
        {(Object.keys(GAME_META) as Array<keyof typeof GAME_META>).map((id) => {
          const g = GAME_META[id];
          return (
            <Link key={id} className="game-card" to={in_ ? "/lobby" : "/register"}>
              <div className="tag" style={{ color: g.accent }}>
                {g.tag}
              </div>
              <h3>{g.title}</h3>
              <p>{g.blurb}</p>
              <span className="mono" style={{ fontSize: 12, color: "var(--mist)" }}>
                {g.seatOptions.join(" / ")} players
                {g.teams ? " · partnerships" : ""}
              </span>
            </Link>
          );
        })}
      </section>
    </>
  );
}
