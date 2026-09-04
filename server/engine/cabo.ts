import { type Card, PEEK_MS, caboValue, makeDeck, shuffle } from "../../shared/cards.ts";
import type { CaboState, ClientAction } from "../../shared/types.ts";

export function createCabo(seats: number): CaboState {
  const packed = shuffle(makeDeck(1));
  const grids: Record<number, (Card | null)[]> = {};
  const peeked: Record<number, boolean> = {};
  let i = 0;
  for (let s = 0; s < seats; s++) {
    grids[s] = [packed[i++], packed[i++], packed[i++], packed[i++]];
    peeked[s] = false;
  }
  const discard = [packed[i++]];
  const deck = packed.slice(i);
  return {
    game: "cabo",
    phase: "peek",
    grids,
    deck,
    deckCount: deck.length,
    discard,
    drawn: null,
    drawnFrom: null,
    currentSeat: 0,
    peeked,
    caboCaller: null,
    turnsAfterCabo: null,
    powerKind: null,
    swapPick: [],
    peekShow: null,
    pendingGive: null,
    matchedThisTurn: false,
    holdUntil: null,
    lastActor: null,
    scores: null,
    winnerSeat: null,
    log: ["Look at your bottom two cards once. Remember them. Lowest total wins."],
  };
}

function nextAlive(state: CaboState, from: number, n: number) {
  return (from + 1) % n;
}

function gridSum(grid: (Card | null)[]) {
  return grid.reduce((s, c) => s + (c ? caboValue(c) : 0), 0);
}

function powerKind(rank: Card["rank"]): CaboState["powerKind"] {
  if (rank === "7" || rank === "8") return "peekSelf";
  if (rank === "9" || rank === "10") return "peekOther";
  if (rank === "J" || rank === "Q") return "swap";
  return null;
}

function emptyCount(grid: (Card | null)[]) {
  return grid.filter((c) => !c).length;
}

function firstEmpty(grid: (Card | null)[]) {
  const i = grid.findIndex((c) => !c);
  return i === -1 ? grid.length : i;
}

function finishTurn(state: CaboState, n: number, names: string[]): CaboState {
  const emptied = Object.values(state.grids).some((g) => g.length > 0 && g.every((c) => !c));
  if (emptied || state.deck.length === 0) return reveal(state, n, names, "The table is out of cards.");
  const next = nextAlive(state, state.currentSeat, n);
  if (state.caboCaller !== null) {
    const left = (state.turnsAfterCabo ?? 1) - 1;
    if (left <= 0 || next === state.caboCaller) {
      return reveal(state, n, names, `${names[state.caboCaller]} called Cabo. Hands up.`);
    }
    return {
      ...state,
      phase: "turn",
      drawn: null,
      drawnFrom: null,
      powerKind: null,
      swapPick: [],
      peekShow: null,
      pendingGive: null,
      matchedThisTurn: false,
      holdUntil: null,
      turnsAfterCabo: left,
      currentSeat: next,
      lastActor: state.currentSeat,
    };
  }
  return {
    ...state,
    phase: "turn",
    drawn: null,
    drawnFrom: null,
    powerKind: null,
    swapPick: [],
    peekShow: null,
    pendingGive: null,
    matchedThisTurn: false,
    holdUntil: null,
    currentSeat: next,
    lastActor: state.currentSeat,
  };
}

function reveal(state: CaboState, n: number, names: string[], why: string): CaboState {
  const scores: Record<number, number> = {};
  let winner = 0;
  for (let i = 0; i < n; i++) {
    scores[i] = gridSum(state.grids[i]);
    if (scores[i] < scores[winner]) winner = i;
  }
  return {
    ...state,
    phase: "over",
    scores,
    winnerSeat: winner,
    drawn: null,
    powerKind: null,
    peekShow: null,
    pendingGive: null,
    holdUntil: null,
    log: [...state.log.slice(-20), why, `${names[winner]} has the lowest pile (${scores[winner]}).`],
  };
}

export function hideCabo(state: CaboState, viewerSeat: number | null): CaboState {
  const grids: Record<number, (Card | null)[]> = {};
  const peeking = state.phase === "peek";
  for (const [k, grid] of Object.entries(state.grids)) {
    const seat = Number(k);
    grids[seat] = grid.map((c, slot) => {
      if (!c) return null;
      if (state.phase === "over" || state.phase === "reveal") return c;
      if (viewerSeat === seat && peeking && slot >= 2) return c;
      if (viewerSeat === seat && state.peekShow && state.peekShow.seat === seat && state.peekShow.slot === slot) {
        return c;
      }
      if (
        viewerSeat !== null &&
        state.peekShow &&
        state.peekShow.seat === seat &&
        state.peekShow.slot === slot &&
        (viewerSeat === state.currentSeat || viewerSeat === state.lastActor)
      ) {
        return c;
      }
      return { id: `hidden-${seat}-${slot}`, suit: "S", rank: "A" };
    });
  }
  return {
    ...state,
    grids,
    deck: [],
    deckCount: state.deck.length,
    drawn:
      state.drawn && (viewerSeat === state.currentSeat || state.phase === "over")
        ? state.drawn
        : state.drawn
          ? { id: "drawn-hidden", suit: "S" as const, rank: "A" as const }
          : null,
  };
}

function penalty(state: CaboState, seat: number, names: string[]): CaboState {
  if (!state.deck.length) return { ...state, log: [...state.log.slice(-24), "No cards left for a penalty."] };
  const card = state.deck[0];
  const grid = [...state.grids[seat]];
  const slot = firstEmpty(grid);
  if (slot >= grid.length) grid.push(card);
  else grid[slot] = card;
  return {
    ...state,
    grids: { ...state.grids, [seat]: grid },
    deck: state.deck.slice(1),
    deckCount: state.deck.length - 1,
    log: [...state.log.slice(-24), `${names[seat]} mismatched — penalty card, unseen.`],
  };
}

export function applyCabo(
  state: CaboState,
  action: ClientAction,
  seat: number,
  n: number,
  names: string[]
): { state: CaboState; error?: string } {
  if (state.phase === "over") return { state, error: "Game is over." };

  if (action.type === "table.advance" && state.phase === "showing") {
    return { state: finishTurn({ ...state, peekShow: state.peekShow }, n, names) };
  }

  if (action.type === "cabo.peekDone") {
    if (state.phase !== "peek") return { state, error: "Peek is over." };
    const peeked = { ...state.peeked, [seat]: true };
    const all = Array.from({ length: n }, (_, i) => peeked[i]);
    if (all.every(Boolean)) {
      return {
        state: {
          ...state,
          peeked,
          phase: "turn",
          currentSeat: 0,
          log: [...state.log.slice(-24), "Cards are down. Draw, swap, match, or call Cabo."],
        },
      };
    }
    return { state: { ...state, peeked } };
  }

  if (action.type === "cabo.call") {
    if (state.phase !== "turn") return { state, error: "Call Cabo at the start of your turn." };
    if (seat !== state.currentSeat) return { state, error: "Not your turn." };
    if (state.caboCaller !== null) return { state, error: "Cabo is already called." };
    return {
      state: {
        ...state,
        caboCaller: seat,
        turnsAfterCabo: n - 1,
        currentSeat: nextAlive(state, seat, n),
        lastActor: seat,
        log: [...state.log.slice(-24), `${names[seat]} calls Cabo. Everyone else gets one more turn.`],
      },
    };
  }

  if (action.type === "cabo.draw") {
    if (state.phase !== "turn") return { state, error: "Not a draw." };
    if (seat !== state.currentSeat) return { state, error: "Not your turn." };
    if (action.from === "discard") {
      if (!state.discard.length) return { state, error: "Discard is empty." };
      const drawn = state.discard[state.discard.length - 1];
      return {
        state: {
          ...state,
          phase: "drawn",
          drawn,
          drawnFrom: "discard",
          discard: state.discard.slice(0, -1),
          matchedThisTurn: false,
        },
      };
    }
    if (!state.deck.length) return { state: reveal(state, n, names, "The deck ran out.") };
    const drawn = state.deck[0];
    return {
      state: {
        ...state,
        phase: "drawn",
        drawn,
        drawnFrom: "deck",
        deck: state.deck.slice(1),
        deckCount: state.deck.length - 1,
        matchedThisTurn: false,
      },
    };
  }

  if (action.type === "cabo.swap") {
    if (state.phase !== "drawn" || !state.drawn) return { state, error: "Draw first." };
    if (seat !== state.currentSeat) return { state, error: "Not your turn." };
    if (state.matchedThisTurn) return { state, error: "You already matched this turn — dump the drawn card." };
    const grid = [...state.grids[seat]];
    const old = grid[action.slot];
    if (!old) return { state, error: "Empty slot." };
    grid[action.slot] = state.drawn;
    return {
      state: finishTurn(
        {
          ...state,
          grids: { ...state.grids, [seat]: grid },
          discard: [...state.discard, old],
          drawn: null,
        },
        n,
        names
      ),
    };
  }

  if (action.type === "cabo.discardDrawn") {
    if (state.phase !== "drawn" || !state.drawn) return { state, error: "Nothing to discard." };
    if (seat !== state.currentSeat) return { state, error: "Not your turn." };
    return {
      state: finishTurn({ ...state, discard: [...state.discard, state.drawn], drawn: null }, n, names),
    };
  }

  if (action.type === "cabo.match") {
    if (state.phase !== "drawn" || !state.drawn) return { state, error: "Draw first." };
    if (seat !== state.currentSeat) return { state, error: "Not your turn." };
    const target = state.grids[action.seat]?.[action.slot];
    if (!target) return { state, error: "No card there." };
    if (target.rank !== state.drawn.rank) {
      return { state: penalty(state, seat, names) };
    }
    const grids = { ...state.grids, [action.seat]: [...state.grids[action.seat]] };
    grids[action.seat][action.slot] = null;
    const discard = [...state.discard, target];
    const ownEmpty = emptyCount(grids[seat]) === grids[seat].length;
    if (ownEmpty) {
      return {
        state: reveal(
          { ...state, grids, discard, drawn: null, matchedThisTurn: true },
          n,
          names,
          `${names[seat]} matched their last card.`
        ),
      };
    }
    if (action.seat !== seat) {
      return {
        state: {
          ...state,
          grids,
          discard,
          phase: "giving",
          pendingGive: { toSeat: action.seat, emptySlot: action.slot },
          matchedThisTurn: true,
          log: [
            ...state.log.slice(-24),
            `${names[seat]} matched a ${state.drawn.rank}. Replace ${names[action.seat]}’s card from your hand.`,
          ],
        },
      };
    }
    return {
      state: {
        ...state,
        grids,
        discard,
        matchedThisTurn: true,
        log: [...state.log.slice(-24), `${names[seat]} matched a ${state.drawn.rank} from their own pile.`],
      },
    };
  }

  if (action.type === "cabo.give") {
    if (state.phase !== "giving" || !state.pendingGive) return { state, error: "Nothing to replace." };
    if (seat !== state.currentSeat) return { state, error: "Not your turn." };
    const mine = [...state.grids[seat]];
    const card = mine[action.slot];
    if (!card) return { state, error: "Empty slot." };
    mine[action.slot] = null;
    const theirs = [...state.grids[state.pendingGive.toSeat]];
    theirs[state.pendingGive.emptySlot] = card;
    const grids = { ...state.grids, [seat]: mine, [state.pendingGive.toSeat]: theirs };
    if (mine.every((c) => !c)) {
      return {
        state: reveal(
          { ...state, grids, drawn: null, pendingGive: null, phase: "drawn" },
          n,
          names,
          `${names[seat]} emptied their pile.`
        ),
      };
    }
    return {
      state: {
        ...state,
        grids,
        phase: "drawn",
        pendingGive: null,
        log: [...state.log.slice(-24), `${names[seat]} slid a card across, unseen.`],
      },
    };
  }

  if (action.type === "cabo.power") {
    if (state.phase !== "drawn" || !state.drawn) return { state, error: "Draw a power card from the deck." };
    if (seat !== state.currentSeat) return { state, error: "Not your turn." };
    if (state.matchedThisTurn) return { state, error: "You already matched this turn." };
    if (state.drawnFrom !== "deck") return { state, error: "Powers only from the face-down pile." };
    const kind = powerKind(state.drawn.rank);
    if (!kind) return { state, error: "That rank has no power." };
    return {
      state: {
        ...state,
        phase: "power",
        powerKind: kind,
        discard: [...state.discard, state.drawn],
        drawn: null,
        swapPick: [],
        log: [...state.log.slice(-24), powerHint(kind)],
      },
    };
  }

  if (action.type === "cabo.look") {
    if (state.phase !== "power" || !state.powerKind) return { state, error: "No power in play." };
    if (seat !== state.currentSeat) return { state, error: "Not your turn." };
    const target = state.grids[action.seat]?.[action.slot];
    if (!target) return { state, error: "No card there." };
    if (state.powerKind === "peekSelf") {
      if (action.seat !== seat) return { state, error: "Look at one of your own." };
      return {
        state: {
          ...state,
          phase: "showing",
          peekShow: { seat: action.seat, slot: action.slot },
          lastActor: seat,
          holdUntil: Date.now() + PEEK_MS,
        },
      };
    }
    if (state.powerKind === "peekOther") {
      if (action.seat === seat) return { state, error: "Look at someone else." };
      return {
        state: {
          ...state,
          phase: "showing",
          peekShow: { seat: action.seat, slot: action.slot },
          lastActor: seat,
          holdUntil: Date.now() + PEEK_MS,
        },
      };
    }
    const pick = [...state.swapPick, { seat: action.seat, slot: action.slot }];
    if (pick.length < 2) return { state: { ...state, swapPick: pick } };
    const [a, b] = pick;
    const grids = { ...state.grids, [a.seat]: [...state.grids[a.seat]], [b.seat]: [...state.grids[b.seat]] };
    const tmp = grids[a.seat][a.slot];
    grids[a.seat][a.slot] = grids[b.seat][b.slot];
    grids[b.seat][b.slot] = tmp;
    return {
      state: finishTurn(
        { ...state, grids, swapPick: [], log: [...state.log.slice(-24), `${names[seat]} switched two cards.`] },
        n,
        names
      ),
    };
  }

  return { state, error: "Unknown Cabo action." };
}

function powerHint(kind: NonNullable<CaboState["powerKind"]>) {
  if (kind === "peekSelf") return "Seven or eight, know your fate — tap one of your cards.";
  if (kind === "peekOther") return "Nine or ten, know a friend — tap someone else’s card.";
  return "Jack or Queen, switch between — tap two cards on the table.";
}

export function botCabo(state: CaboState, seat: number): ClientAction | null {
  if (state.phase === "peek" && !state.peeked[seat]) return { type: "cabo.peekDone" };
  if (state.phase === "showing") return null;
  if (state.phase === "giving" && state.currentSeat === seat && state.pendingGive) {
    const slot = state.grids[seat].findIndex((c) => c);
    if (slot >= 0) return { type: "cabo.give", slot };
    return { type: "cabo.discardDrawn" };
  }
  if (state.phase === "turn" && state.currentSeat === seat) {
    const known = state.grids[seat].slice(2).filter(Boolean) as Card[];
    const sum = known.reduce((s, c) => s + caboValue(c), 0);
    const remaining = state.grids[seat].filter(Boolean).length;
    if (!state.caboCaller && remaining <= 2 && sum <= 6 && Math.random() < 0.45) return { type: "cabo.call" };
    return { type: "cabo.draw", from: "deck" };
  }
  if (state.phase === "drawn" && state.currentSeat === seat && state.drawn) {
    if (state.matchedThisTurn) return { type: "cabo.discardDrawn" };
    const kind = state.drawnFrom === "deck" ? powerKind(state.drawn.rank) : null;
    if (kind && Math.random() < 0.55) return { type: "cabo.power" };
    const grid = state.grids[seat];
    const same = grid.findIndex((c) => c && c.rank === state.drawn!.rank);
    if (same >= 0 && Math.random() < 0.5) return { type: "cabo.match", seat, slot: same };
    let worst = -1;
    let worstV = -1;
    grid.forEach((c, i) => {
      if (!c) return;
      const v = caboValue(c);
      if (v > worstV) {
        worstV = v;
        worst = i;
      }
    });
    if (worst >= 0 && caboValue(state.drawn) < worstV) return { type: "cabo.swap", slot: worst };
    return { type: "cabo.discardDrawn" };
  }
  if (state.phase === "power" && state.currentSeat === seat && state.powerKind) {
    const ownSlot = state.grids[seat].findIndex((c) => c);
    const other = Object.keys(state.grids)
      .map(Number)
      .find((s) => s !== seat && state.grids[s].some(Boolean)) ?? 0;
    const otherSlot = state.grids[other]?.findIndex((c) => c) ?? 0;
    if (state.powerKind === "peekSelf") {
      if (ownSlot < 0) return null;
      return { type: "cabo.look", seat, slot: ownSlot };
    }
    if (state.powerKind === "peekOther") {
      if (otherSlot < 0) return null;
      return { type: "cabo.look", seat: other, slot: otherSlot };
    }
    if (state.swapPick.length === 0) {
      if (ownSlot < 0) return null;
      return { type: "cabo.look", seat, slot: ownSlot };
    }
    if (otherSlot < 0) return null;
    return { type: "cabo.look", seat: other, slot: otherSlot };
  }
  return null;
}
