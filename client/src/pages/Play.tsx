import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { RANKS, SUIT_NAME, type Rank } from "@shared/cards.ts";
import { legalCallBreak, legalMendi } from "@shared/legal.ts";
import { GAME_META, type CaboState, type ClientAction, type RoomPublic } from "@shared/types.ts";
import { CaboBoard, MiniGrid, caboHint } from "../components/CaboBoard.tsx";
import { ChatPanel } from "../components/ChatPanel.tsx";
import { PlayingCard } from "../components/PlayingCard.tsx";
import { RulesRail } from "../components/RulesRail.tsx";
import { Seats, trickStyle } from "../components/Seats.tsx";
import { connect, emit, loadSession } from "../session.ts";

export function Play() {
  const { id } = useParams();
  const nav = useNavigate();
  const session = loadSession()!;
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [rank, setRank] = useState<Rank>("A");
  const [call, setCall] = useState(2);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());
  const [chatOpen, setChatOpen] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const s = connect(session.token);
    s.emit("room:join", { id }, (res: { ok: boolean; error?: string; room?: RoomPublic }) => {
      if (res.ok && res.room) setRoom(res.room);
    });
    const onState = (r: RoomPublic) => {
      if (r.phase === "lobby") {
        nav(`/table/${r.id}`, { replace: true });
        return;
      }
      setRoom(r);
      setSelected([]);
      setErr("");
    };
    s.on("room:state", onState);
    s.on("room:left", () => nav("/lobby"));
    return () => {
      s.off("room:state", onState);
    };
  }, [id, session.token, nav]);

  async function act(action: ClientAction) {
    if (!room) return;
    const res = await emit<{ ok: boolean; error?: string }>("game:action", { roomId: room.id, action });
    if (!res.ok) setErr(res.error ?? "Illegal play");
  }

  const youSeat = room?.youSeat ?? 0;
  const game = room?.game ?? null;
  const hand = game && game.game !== "cabo" && "hands" in game ? (game.hands[youSeat] ?? []) : [];
  const legalIds = useMemo(() => {
    if (!game || game.game === "cabo" || game.game === "bluff") return new Set(hand.map((c) => c.id));
    if (game.game === "callBreak") return new Set(legalCallBreak(game, youSeat).map((c) => c.id));
    return new Set(legalMendi(game, youSeat).map((c) => c.id));
  }, [game, youSeat, hand]);

  if (!room || !game || room.youSeat === null) {
    return <div className="room-hero">Dealing…</div>;
  }

  const you = room.youSeat;
  const holding = (game.game === "callBreak" || game.game === "mendi") && game.phase === "holding";
  const turn =
    holding ||
    (game.game === "bluff" && game.phase === "challenge") ||
    (game.game === "cabo" && (game.phase === "showing" || game.phase === "peek"))
      ? null
      : "currentSeat" in game
        ? game.currentSeat
        : null;
  const wonSeats = (() => {
    if ((game.game === "callBreak" || game.game === "mendi") && holding && game.lastTrickWinner !== null) {
      return [game.lastTrickWinner];
    }
    if (game.game === "mendi" && game.phase === "handEnd" && game.lastResult) {
      const team = game.lastResult.startsWith("Team A") ? "A" : game.lastResult.startsWith("Team B") ? "B" : null;
      if (team) return room.seats.filter((s) => s.team === team).map((s) => s.index);
    }
    if (game.game === "callBreak" && game.phase === "roundEnd") {
      let best = 0;
      for (let i = 1; i < room.seats.length; i++) {
        if ((game.roundScores[i] ?? 0) > (game.roundScores[best] ?? 0)) best = i;
      }
      return [best];
    }
    if (game.game === "cabo" && game.lastActor !== null && (game.phase === "showing" || game.phase === "turn")) {
      return [game.lastActor];
    }
    return [];
  })();
  const wonSeat = wonSeats[0] ?? null;
  const meta = GAME_META[room.config.game];
  const challengeLeft =
    game.game === "bluff" && game.phase === "challenge" && game.challengeUntil
      ? Math.max(0, Math.ceil((game.challengeUntil - now) / 1000))
      : 0;

  function caboSlot(seat: number, slot: number) {
    if (game?.game !== "cabo") return;
    if (game.phase === "power") act({ type: "cabo.look", seat, slot });
    else if (game.phase === "giving" && seat === you) act({ type: "cabo.give", slot });
    else if (game.phase === "drawn" && game.drawn && game.currentSeat === you) {
      const card = game.grids[seat]?.[slot];
      if (!card) return;
      const known = !card.id.startsWith("hidden-");
      if (seat === you && (!known || card.rank !== game.drawn.rank)) act({ type: "cabo.swap", slot });
      else act({ type: "cabo.match", seat, slot });
    }
  }

  return (
    <div className={`play-shell ${chatOpen ? "" : "chat-collapsed"} ${rulesOpen ? "" : "rules-collapsed"}`}>
      <header className="topbar">
        <Link className="mark" to="/lobby">
          <span className="ring">♠</span>
          <div>
            <strong>{meta.title}</strong>
            <span className="mono">{room.code}</span>
          </div>
        </Link>
        <div className="status">{statusLine(room)}</div>
        <button className="btn ghost" type="button" onClick={() => navigator.clipboard.writeText(room.code)}>
          Copy {room.code}
        </button>
        <button className="btn ghost" type="button" onClick={() => {
          connect(session.token).emit("room:leave", room.id);
          nav("/lobby");
        }}>
          Leave
        </button>
      </header>

      <ChatPanel
        messages={room.chat}
        teamEnabled={meta.teams}
        collapsed={!chatOpen}
        onToggle={() => setChatOpen((v) => !v)}
        onSend={(text, team) => connect(session.token).emit("room:chat", { roomId: room.id, text, team })}
      />

      <div className="table-wrap">
        <div className="felt" />
        <div className="wood-rim" />
        <div className="mandala" />
        <Seats seats={room.seats} youSeat={you} turnSeat={turn} wonSeats={wonSeats} />
        {game.game === "cabo" ? (
          <CaboBoard state={game} seats={room.seats} youSeat={you} onSlot={caboSlot} />
        ) : null}
        <TrickFelt room={room} you={you} holding={holding} />
        <TrumpChip room={room} />
        <div className="center-play">{center(room, challengeLeft)}</div>
        {holding && wonSeat !== null ? (
          <div className="trick-banner">{room.seats[wonSeat]?.name} takes the trick</div>
        ) : game.game === "mendi" && game.phase === "handEnd" && game.lastResult ? (
          <div className="trick-banner">{game.lastResult}</div>
        ) : null}
        {err ? <div className="toast">{err}</div> : null}
        {overBanner(room)}

        <div className={`hand-dock ${wonSeat === you ? "you-won" : ""}`}>
          {game.game === "bluff" && game.phase === "lead" && turn === you ? (
            <div className="rank-pick">
              {RANKS.map((r) => (
                <button key={r} type="button" className={rank === r ? "on" : ""} onClick={() => setRank(r)}>
                  {r}
                </button>
              ))}
            </div>
          ) : null}
          {game.game === "callBreak" && game.phase === "calling" && turn === you ? (
            <div className="actions" style={{ marginBottom: 8 }}>
              <span className="status">Your call</span>
              <input type="range" min={1} max={13} value={call} onChange={(e) => setCall(Number(e.target.value))} />
              <strong className="mono">{call}</strong>
              <button className="btn solid" type="button" onClick={() => act({ type: "callBreak.call", tricks: call })}>
                Call {call}
              </button>
            </div>
          ) : null}
          {game.game === "cabo" ? (
            <CaboDock state={game} you={you} act={act} />
          ) : (
            <div className="hand">
              {hand.map((c) => {
                const illegal =
                  (game.game === "callBreak" && game.phase === "trick") ||
                  (game.game === "mendi" && game.phase === "trick")
                    ? !legalIds.has(c.id)
                    : false;
                return (
                  <PlayingCard
                    key={c.id}
                    card={c}
                    selected={selected.includes(c.id)}
                    illegal={illegal || holding}
                    onClick={() => {
                      if (holding) return;
                      if (game.game === "bluff") {
                        setSelected((cur) =>
                          cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id]
                        );
                        return;
                      }
                      if (illegal) return;
                      if (game.game === "callBreak" && game.phase === "trick" && turn === you) {
                        act({ type: "callBreak.play", cardId: c.id });
                      } else if (game.game === "mendi" && game.phase === "setTrump" && turn === you) {
                        act({ type: "mendi.setTrump", cardId: c.id });
                      } else if (game.game === "mendi" && game.phase === "trick" && turn === you) {
                        act({ type: "mendi.play", cardId: c.id });
                      }
                    }}
                  />
                );
              })}
            </div>
          )}
          {game.game === "bluff" ? (
            <div className="actions">
              <button
                className="btn solid"
                type="button"
                disabled={turn !== you || game.phase === "challenge" || selected.length === 0}
                onClick={() =>
                  act({
                    type: "bluff.play",
                    cardIds: selected,
                    claimedRank: game.phase === "lead" ? rank : undefined,
                  })
                }
              >
                Play {selected.length || ""} {game.phase === "lead" ? rank : game.currentRank ?? ""}
              </button>
              <button className="btn" type="button" disabled={turn !== you || game.phase !== "follow"} onClick={() => act({ type: "bluff.pass" })}>
                Pass
              </button>
              <button
                className="btn flame"
                type="button"
                disabled={game.phase !== "challenge" || game.lastPlay?.seat === you}
                onClick={() => act({ type: "bluff.call" })}
              >
                Bluff! {challengeLeft ? `${challengeLeft}s` : ""}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <RulesRail game={room.config.game} collapsed={!rulesOpen} onToggle={() => setRulesOpen((v) => !v)} />
    </div>
  );
}

function CaboDock({
  state,
  you,
  act,
}: {
  state: CaboState;
  you: number;
  act: (a: ClientAction) => void;
}) {
  const mine = state.grids[you] ?? [];
  const top = state.discard[state.discard.length - 1];
  return (
    <div>
      <div className="status" style={{ textAlign: "center", marginBottom: 8 }}>
        {caboHint(state)}
      </div>
      <div className="cabo-actions">
        <div className="cabo-piles">
          <div>
            <div className="mono" style={{ fontSize: 10 }}>Deck {state.deckCount}</div>
            <PlayingCard back onClick={() => act({ type: "cabo.draw", from: "deck" })} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: 10 }}>Discard</div>
            {top ? (
              <PlayingCard card={top} onClick={() => act({ type: "cabo.draw", from: "discard" })} />
            ) : (
              <PlayingCard back />
            )}
          </div>
          {state.drawn && state.currentSeat === you ? (
            <div>
              <div className="mono" style={{ fontSize: 10 }}>Drawn</div>
              <PlayingCard card={state.drawn.id.startsWith("drawn") ? undefined : state.drawn} back={state.drawn.id.startsWith("drawn")} />
            </div>
          ) : null}
        </div>
        <MiniGrid
          grid={mine}
          seat={you}
          faceUp={state.phase === "peek"}
          picked={[...state.swapPick, ...(state.peekShow ? [state.peekShow] : [])]}
          onSlot={(seat, slot) => {
            if (state.phase === "power") act({ type: "cabo.look", seat, slot });
            else if (state.phase === "giving") act({ type: "cabo.give", slot });
            else if (state.phase === "drawn" && state.drawn) {
              const card = mine[slot];
              if (!card) return;
              const known = !card.id.startsWith("hidden-");
              if (!known || card.rank !== state.drawn.rank) act({ type: "cabo.swap", slot });
              else act({ type: "cabo.match", seat, slot });
            }
          }}
        />
        <div className="actions">
          {state.phase === "peek" ? (
            <button className="btn solid" type="button" onClick={() => act({ type: "cabo.peekDone" })}>
              I remember
            </button>
          ) : null}
          {state.phase === "turn" && state.currentSeat === you ? (
            <button className="btn flame" type="button" onClick={() => act({ type: "cabo.call" })}>
              Cabo
            </button>
          ) : null}
          {state.phase === "drawn" && state.currentSeat === you ? (
            <>
              <button className="btn" type="button" onClick={() => act({ type: "cabo.discardDrawn" })}>
                Dump it
              </button>
              <button className="btn solid" type="button" onClick={() => act({ type: "cabo.power" })}>
                Use power
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function statusLine(room: RoomPublic) {
  const g = room.game;
  if (!g) return "";
  if (g.game === "bluff") {
    if (g.phase === "over") return "Someone is out";
    if (g.phase === "challenge") return `Call Bluff on ${g.lastPlay?.name ?? "that play"}`;
    if (g.phase === "lead") return `${room.seats[g.currentSeat]?.name} leads`;
    return `${room.seats[g.currentSeat]?.name} · ${g.currentRank ?? ""} · pile ${g.pileCount}`;
  }
  if (g.game === "callBreak") {
    const trump = g.trump ? SUIT_NAME[g.trump] : g.trumpMode === "cut" ? "waiting for a cut" : "—";
    return `Deal ${g.round}/${g.totalRounds} · trick ${g.trickNumber}/${g.totalTricks} · ${trump}`;
  }
  if (g.game === "cabo") {
    return g.phase === "peek" ? "Memorize your bottom two" : `${room.seats[g.currentSeat]?.name} · ${g.phase}`;
  }
  const trump = g.trumpRevealed && g.trump ? SUIT_NAME[g.trump] : g.trumpMode === "cut" ? "no cut yet" : "closed";
  return `Hand ${g.handNumber} · tens A ${g.teamTens.A.length}–${g.teamTens.B.length} B · ${trump}`;
}

function center(room: RoomPublic, challengeLeft: number) {
  const g = room.game;
  if (!g) return null;
  if (g.game === "cabo") {
    return (
      <div className="status">
        {g.caboCaller !== null ? `${room.seats[g.caboCaller]?.name} called Cabo` : "Keep the pile small"}
      </div>
    );
  }
  if (g.game === "bluff") {
    return (
      <>
        <div className="pile-stack">{g.pileCount > 0 ? <PlayingCard back /> : <div className="status">Empty pile</div>}</div>
        <div className="status">
          {g.lastPlay ? `${g.lastPlay.name}: ${g.lastPlay.count}× ${g.lastPlay.claimedRank}` : "Lead a rank"}
          {g.phase === "challenge" ? ` · ${challengeLeft}s` : ""}
        </div>
        <div className="scoreline">
          {room.seats.map((s) => (
            <span className="badge" key={s.index}>
              {s.name} {g.hands[s.index]?.length ?? 0}
            </span>
          ))}
        </div>
      </>
    );
  }
  const power = "powerCard" in g ? g.powerCard : null;
  const showing = g.phase === "showPower" && power;
  return (
    <>
      {showing ? (
        <div className="power-reveal">
          <div className="kicker">Power card</div>
          <PlayingCard card={power} />
          <div className="status">Trump is {g.trump ? SUIT_NAME[g.trump] : ""}</div>
        </div>
      ) : (
        <div className="trick-hud">
          {g.game === "mendi" && g.hiddenTrump && !g.trumpRevealed ? (
            <div className="closed-trump">
              <PlayingCard back tiny />
              <span className="mono">closed</span>
            </div>
          ) : null}
        </div>
      )}
      {g.game === "callBreak" ? (
        <div className="scoreline">
          {room.seats.map((s) => (
            <span className={`badge ${g.lastTrickWinner === s.index ? "hot" : ""}`} key={s.index}>
              {s.name} {g.calls[s.index] ?? "—"}/{g.tricksWon[s.index]} · {g.scores[s.index]}
            </span>
          ))}
        </div>
      ) : g.game === "mendi" ? (
        <div className="scoreline">
          <span className="badge">Team A · {g.teamHands.A} hands · {g.teamTens.A.length} tens · {g.teamTricks.A} tricks</span>
          <span className="badge">Team B · {g.teamHands.B} hands · {g.teamTens.B.length} tens · {g.teamTricks.B} tricks</span>
        </div>
      ) : null}
    </>
  );
}

function overBanner(room: RoomPublic) {
  const g = room.game;
  if (!g) return null;
  if (g.game === "bluff" && g.phase === "over" && g.winnerSeat !== null) {
    return wrapWin(room.seats[g.winnerSeat]?.name ?? "", "The pile is empty for");
  }
  if (g.game === "callBreak" && g.phase === "over" && g.winnerSeat !== null) {
    return wrapWin(room.seats[g.winnerSeat]?.name ?? "", "Highest score", `${g.scores[g.winnerSeat]} points`);
  }
  if (g.game === "mendi" && g.phase === "over" && g.winnerTeam) {
    return wrapWin(`Team ${g.winnerTeam}`, "The sitting belongs to", `${g.teamHands.A}–${g.teamHands.B}`);
  }
  if (g.game === "cabo" && g.phase === "over" && g.winnerSeat !== null) {
    return wrapWin(room.seats[g.winnerSeat]?.name ?? "", "Lowest pile", `${g.scores?.[g.winnerSeat] ?? 0} points`);
  }
  return null;
}

function wrapWin(title: string, kicker: string, sub?: string) {
  return (
    <div className="winner">
      <div>
        <div className="kicker">{kicker}</div>
        <h2>{title}</h2>
        {sub ? <p className="mono">{sub}</p> : null}
        <Link className="btn solid" to="/lobby">
          Back to the hall
        </Link>
      </div>
    </div>
  );
}

function TrickFelt({ room, you, holding }: { room: RoomPublic; you: number; holding: boolean }) {
  const g = room.game;
  if (!g || (g.game !== "callBreak" && g.game !== "mendi")) return null;
  return (
    <>
      {g.trick.map((p, i) => {
        const win = holding && g.lastTrickWinner === p.seat;
        return (
          <div
            key={p.card.id}
            className={`trick-on-felt ${win ? "winner-card" : ""}`}
            style={{ ...trickStyle(p.seat, room.seats.length, you), animationDelay: `${i * 90}ms` }}
          >
            <PlayingCard card={p.card} />
            <div className="trick-who">{room.seats[p.seat]?.name}</div>
          </div>
        );
      })}
    </>
  );
}

function TrumpChip({ room }: { room: RoomPublic }) {
  const g = room.game;
  if (!g || (g.game !== "callBreak" && g.game !== "mendi")) return null;
  if (g.phase === "showPower") return null;
  const trump = g.game === "mendi" ? (g.trumpRevealed ? g.trump : null) : g.trump;
  const waiting = !trump && g.trumpMode === "cut";
  const closed = g.game === "mendi" && !g.trumpRevealed && g.trumpMode === "classic";
  const label = trump ? SUIT_NAME[trump] : waiting ? "Waiting for a cut" : closed ? "Closed trump" : "Trump";
  const glyph = trump === "S" ? "♠" : trump === "H" ? "♥" : trump === "D" ? "♦" : trump === "C" ? "♣" : "—";
  return (
    <div className={`trump-chip ${trump ? `suit-${trump}` : ""}`}>
      <span className="kicker">Trump</span>
      <strong>{glyph}</strong>
      <em>{label}</em>
    </div>
  );
}

