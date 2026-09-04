import {
  type Card,
  type Rank,
  dealEven,
  makeDeck,
  pluralRank,
  shuffle,
  sortHand,
} from "../../shared/cards.ts";
import type { BluffState, ClientAction } from "../../shared/types.ts";

export function createBluff(seats: number): BluffState {
  const decks = seats >= 6 ? 2 : 1;
  const handsArr = dealEven(shuffle(makeDeck(decks)), seats);
  const hands: Record<number, Card[]> = {};
  handsArr.forEach((h, i) => {
    hands[i] = sortHand(h);
  });
  return {
    game: "bluff",
    phase: "lead",
    hands,
    pile: [],
    pileCount: 0,
    currentSeat: 0,
    currentRank: null,
    lastPlay: null,
    consecutivePasses: 0,
    challengeUntil: null,
    winnerSeat: null,
    log: [`${decks === 2 ? "Two decks" : "One deck"}. Lead any rank.`],
    decks,
    maxPlay: decks === 2 ? 8 : 4,
  };
}

function nextSeat(state: BluffState, from: number, n: number): number {
  return (from + 1) % n;
}

function aliveCount(state: BluffState, n: number): number {
  return Array.from({ length: n }, (_, i) => i).filter((i) => state.hands[i].length > 0).length;
}

function nextAlive(state: BluffState, from: number, n: number): number {
  let s = nextSeat(state, from, n);
  for (let i = 0; i < n; i++) {
    if (state.hands[s].length > 0) return s;
    s = nextSeat(state, s, n);
  }
  return s;
}

export function hideBluff(state: BluffState, viewerSeat: number | null): BluffState {
  const hands: Record<number, Card[]> = {};
  for (const [k, cards] of Object.entries(state.hands)) {
    const seat = Number(k);
    hands[seat] =
      viewerSeat === seat
        ? cards
        : cards.map((c, i) => ({ id: `hidden-${seat}-${i}`, suit: "S", rank: "A" }));
  }
  return {
    ...state,
    hands,
    pile: state.pile.map((c, i) => ({ id: `pile-${i}`, suit: "S", rank: "A" })),
    lastPlay: state.lastPlay
      ? {
          ...state.lastPlay,
          revealed: state.phase === "challenge" ? undefined : state.lastPlay.revealed,
        }
      : null,
  };
}

export function applyBluff(
  state: BluffState,
  action: ClientAction,
  seat: number,
  n: number,
  names: string[],
  now = Date.now()
): { state: BluffState; error?: string } {
  if (state.phase === "over") return { state, error: "Game is over." };

  if (action.type === "bluff.call") {
    if (state.phase !== "challenge" || !state.lastPlay) {
      return { state, error: "Nothing to call." };
    }
    if (seat === state.lastPlay.seat) return { state, error: "You cannot call your own play." };
    const last = state.lastPlay;
    const honest = last.revealed!.every((c) => c.rank === last.claimedRank);
    if (honest && state.hands[last.seat].length === 0) {
      return {
        state: {
          ...state,
          phase: "over",
          winnerSeat: last.seat,
          challengeUntil: null,
          lastPlay: { ...last, wasBluff: false },
          log: [...state.log.slice(-24), `${names[seat]} called Bluff — it was true. ${names[last.seat]} is already out.`],
        },
      };
    }
    const taker = honest ? seat : last.seat;
    const pile = [...state.pile];
    const hands = { ...state.hands, [taker]: sortHand([...state.hands[taker], ...pile]) };
    const log = honest
      ? `${names[seat]} called Bluff — it was true. ${names[seat]} takes ${pile.length} cards.`
      : `${names[seat]} called Bluff — caught ${names[last.seat]}. ${names[last.seat]} takes ${pile.length} cards.`;
    const next: BluffState = {
      ...state,
      phase: "lead",
      hands,
      pile: [],
      pileCount: 0,
      currentSeat: nextAlive({ ...state, hands }, taker, n),
      currentRank: null,
      lastPlay: { ...last, wasBluff: !honest },
      consecutivePasses: 0,
      challengeUntil: null,
      log: [...state.log.slice(-24), log],
    };
    return { state: next };
  }

  if (state.phase === "challenge") {
    if (now < (state.challengeUntil ?? 0)) {
      return { state, error: "Bluff window is still open." };
    }
    const emptied = state.lastPlay && state.hands[state.lastPlay.seat].length === 0;
    if (emptied) {
      return {
        state: {
          ...state,
          phase: "over",
          winnerSeat: state.lastPlay!.seat,
          challengeUntil: null,
          log: [...state.log.slice(-24), `${names[state.lastPlay!.seat]} is out. Table wins them the night.`],
        },
      };
    }
    state = {
      ...state,
      phase: state.currentRank ? "follow" : "lead",
      challengeUntil: null,
      currentSeat: nextAlive(state, state.lastPlay?.seat ?? state.currentSeat, n),
    };
  }

  if (seat !== state.currentSeat) return { state, error: "Not your turn." };

  if (action.type === "bluff.pass") {
    if (state.phase !== "follow") return { state, error: "The leader must play." };
    const consecutivePasses = state.consecutivePasses + 1;
    const others = Math.max(1, aliveCount(state, n) - 1);
    if (consecutivePasses >= others) {
      const nextSeatIdx = nextAlive(state, seat, n);
      return {
        state: {
          ...state,
          phase: "lead",
          pile: [],
          pileCount: 0,
          currentSeat: nextSeatIdx,
          currentRank: null,
          lastPlay: null,
          consecutivePasses: 0,
          log: [...state.log.slice(-24), `All passed. Pile swept. ${names[nextSeatIdx]} leads.`],
        },
      };
    }
    return {
      state: {
        ...state,
        consecutivePasses,
        currentSeat: nextAlive(state, seat, n),
        log: [...state.log.slice(-24), `${names[seat]} passes.`],
      },
    };
  }

  if (action.type !== "bluff.play") return { state, error: "Unknown action." };

  const hand = state.hands[seat];
  const cards = action.cardIds
    .map((id) => hand.find((c) => c.id === id))
    .filter((c): c is Card => Boolean(c));
  if (cards.length !== action.cardIds.length) return { state, error: "Those cards are not in your hand." };
  if (cards.length < 1) return { state, error: "Play at least one card." };
  if (cards.length > state.maxPlay) return { state, error: `Play at most ${state.maxPlay} cards.` };
  if (new Set(action.cardIds).size !== action.cardIds.length) return { state, error: "Duplicate cards." };

  let claimed = action.claimedRank;
  if (state.phase === "follow") {
    if (!state.currentRank) return { state, error: "No rank to follow." };
    claimed = state.currentRank;
  } else {
    if (!claimed) return { state, error: "Name a rank." };
  }

  const remaining = hand.filter((c) => !action.cardIds.includes(c.id));
  const lastPlay: BluffState["lastPlay"] = {
    seat,
    name: names[seat],
    claimedRank: claimed!,
    count: cards.length,
    revealed: cards,
  };

  return {
    state: {
      ...state,
      phase: "challenge",
      hands: { ...state.hands, [seat]: remaining },
      pile: [...state.pile, ...cards],
      pileCount: state.pile.length + cards.length,
      currentRank: claimed!,
      lastPlay,
      consecutivePasses: 0,
      challengeUntil: now + 7000,
      log: [...state.log.slice(-24), `${names[seat]} plays ${pluralRank(claimed!, cards.length)}.`],
    },
  };
}

export function resolveBluffTimeout(state: BluffState, n: number, names: string[]): BluffState {
  if (state.phase !== "challenge" || !state.lastPlay) return state;
  if (state.hands[state.lastPlay.seat].length === 0) {
    return {
      ...state,
      phase: "over",
      winnerSeat: state.lastPlay.seat,
      challengeUntil: null,
      log: [...state.log.slice(-24), `${names[state.lastPlay.seat]} gets away with it and wins.`],
    };
  }
  return {
    ...state,
    phase: "follow",
    challengeUntil: null,
    currentSeat: nextAlive(state, state.lastPlay.seat, n),
  };
}
