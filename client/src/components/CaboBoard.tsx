import { caboValue } from "@shared/cards.ts";
import type { CaboState, Seat } from "@shared/types.ts";
import { PlayingCard } from "./PlayingCard.tsx";
import { trickStyle } from "./Seats.tsx";

export function CaboBoard({
  state,
  seats,
  youSeat,
  onSlot,
}: {
  state: CaboState;
  seats: Seat[];
  youSeat: number;
  onSlot: (seat: number, slot: number) => void;
}) {
  return (
    <>
      {seats.map((s) => {
        if (s.index === youSeat) return null;
        return (
          <div key={s.index} className="cabo-grid" style={trickStyle(s.index, seats.length, youSeat)}>
            <MiniGrid
              grid={state.grids[s.index] ?? []}
              seat={s.index}
              onSlot={onSlot}
              picked={[...state.swapPick, ...(state.peekShow ? [state.peekShow] : [])]}
            />
          </div>
        );
      })}
    </>
  );
}

export function MiniGrid({
  grid,
  seat,
  onSlot,
  picked,
}: {
  grid: ({ id: string; suit: string; rank: string } | null)[];
  seat: number;
  onSlot: (seat: number, slot: number) => void;
  picked: { seat: number; slot: number }[];
  faceUp?: boolean;
}) {
  return (
    <div className="cabo-mini">
      {grid.map((c, slot) => {
            const sel = picked.some((p) => p.seat === seat && p.slot === slot);
            const hidden = !c || c.id.startsWith("hidden-");
        return (
          <PlayingCard
            key={`${seat}-${slot}`}
            tiny
            back={hidden}
            card={hidden ? undefined : (c as never)}
            selected={sel}
            onClick={() => onSlot(seat, slot)}
          />
        );
      })}
    </div>
  );
}

export function caboHint(state: CaboState) {
  if (state.phase === "peek") return "Look at your bottom two. Then tap I remember.";
  if (state.phase === "turn") return state.caboCaller !== null ? "Cabo is called — last turns." : "Draw, match, or call Cabo.";
  if (state.phase === "drawn") {
    if (state.matchedThisTurn) return "Keep matching the same rank, then dump the drawn card.";
    return "Swap it in, match a known rank, dump it, or spend a power.";
  }
  if (state.phase === "giving") return "Tap one of your cards to replace the one you took.";
  if (state.phase === "showing") return "Remember that card.";
  if (state.phase === "power") {
    if (state.powerKind === "peekSelf") return "Tap one of your cards.";
    if (state.powerKind === "peekOther") return "Tap someone else’s card.";
    return "Tap two cards to switch them.";
  }
  if (state.phase === "over") return "Lowest pile wins.";
  return "";
}

export function gridPoints(grid: ({ id?: string; rank: string; suit: string } | null)[]) {
  return grid.reduce((s, c) => (c && !String(c.id ?? "").startsWith("hidden") ? s + caboValue(c as never) : s), 0);
}
