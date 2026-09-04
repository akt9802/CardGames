import {
  type Card,
  type Suit,
  HOLD_MS,
  POWER_MS,
  SUIT_NAME,
  dealEven,
  makeDeck,
  rankValue,
  shuffle,
  sortHand,
} from "../../shared/cards.ts";
import type { CallBreakState, ClientAction, TrumpMode } from "../../shared/types.ts";

function dealPack(seats: number, mode: TrumpMode) {
  const decks = seats === 8 ? 2 : 1;
  const packed = shuffle(makeDeck(decks));
  let powerCard: Card | null = null;
  let trump: Suit | null = "S";
  if (mode === "power") {
    powerCard = packed[0];
    trump = powerCard.suit;
  } else if (mode === "cut") {
    trump = null;
  }
  const handsArr = dealEven(packed, seats);
  const hands: Record<number, Card[]> = {};
  handsArr.forEach((h, i) => {
    hands[i] = sortHand(h);
  });
  return { decks, hands, powerCard, trump };
}

export function createCallBreak(
  seats: number,
  totalRounds = 5,
  trumpMode: TrumpMode = "classic"
): CallBreakState {
  const { decks, hands, powerCard, trump } = dealPack(seats, trumpMode);
  const calls: Record<number, number | null> = {};
  const tricksWon: Record<number, number> = {};
  const scores: Record<number, number> = {};
  const roundScores: Record<number, number> = {};
  for (let i = 0; i < seats; i++) {
    calls[i] = null;
    tricksWon[i] = 0;
    scores[i] = 0;
    roundScores[i] = 0;
  }
  const dealerSeat = 0;
  const leadSeat = (dealerSeat - 1 + seats) % seats;
  const showing = trumpMode === "power";
  return {
    game: "callBreak",
    phase: showing ? "showPower" : "calling",
    round: 1,
    totalRounds,
    dealerSeat,
    hands,
    calls,
    tricksWon,
    scores,
    roundScores,
    currentSeat: leadSeat,
    leadSeat,
    trick: [],
    trickNumber: 1,
    totalTricks: 13,
    trumpMode,
    trump,
    powerCard,
    lastTrickWinner: null,
    holdUntil: showing ? Date.now() + POWER_MS : null,
    winnerSeat: null,
    log: [
      seats === 8 ? "Two decks. 13 cards each. First of a twin wins ties." : "Thirteen tricks. Call what you can make.",
      trumpLine(trumpMode, trump, powerCard),
    ],
    decks,
  };
}

function trumpLine(mode: TrumpMode, trump: Suit | null, power: Card | null) {
  if (mode === "classic") return "Classic: Spades are trump.";
  if (mode === "power" && power && trump) {
    return `Power card ${power.rank}${power.suit} — trump is ${SUIT_NAME[trump]}.`;
  }
  return "Cut: no trump until the first player who cannot follow. That card’s suit becomes trump.";
}

function trickWinner(trick: { seat: number; card: Card }[], led: Suit, trump: Suit | null): number {
  let bestI = 0;
  for (let i = 1; i < trick.length; i++) {
    const p = trick[i].card;
    const b = trick[bestI].card;
    const pT = trump !== null && p.suit === trump;
    const bT = trump !== null && b.suit === trump;
    if (pT && !bT) {
      bestI = i;
      continue;
    }
    if (!pT && bT) continue;
    if (p.suit === b.suit && rankValue(p.rank) > rankValue(b.rank)) bestI = i;
  }
  return trick[bestI].seat;
}

export function legalCallBreakCards(state: CallBreakState, seat: number): Card[] {
  const hand = state.hands[seat] ?? [];
  if (state.phase === "holding" || state.phase === "showPower") return [];
  if (state.trick.length === 0) return hand;
  const led = state.trick[0].card.suit;
  const ofLed = hand.filter((c) => c.suit === led);
  return ofLed.length ? ofLed : hand;
}

function scoreRound(state: CallBreakState, n: number): CallBreakState {
  const roundScores: Record<number, number> = {};
  const scores = { ...state.scores };
  for (let i = 0; i < n; i++) {
    const call = state.calls[i] ?? 1;
    const won = state.tricksWon[i];
    const pts = won >= call ? call + (won - call) * 0.1 : -call;
    roundScores[i] = Math.round(pts * 10) / 10;
    scores[i] = Math.round((scores[i] + roundScores[i]) * 10) / 10;
  }
  return { ...state, roundScores, scores };
}

function nextDeal(state: CallBreakState, n: number): CallBreakState {
  const { decks, hands, powerCard, trump } = dealPack(n, state.trumpMode);
  const calls: Record<number, number | null> = {};
  const tricksWon: Record<number, number> = {};
  for (let i = 0; i < n; i++) {
    calls[i] = null;
    tricksWon[i] = 0;
  }
  const dealerSeat = (state.dealerSeat - 1 + n) % n;
  const leadSeat = (dealerSeat - 1 + n) % n;
  const showing = state.trumpMode === "power";
  return {
    ...state,
    phase: showing ? "showPower" : "calling",
    round: state.round + 1,
    dealerSeat,
    hands,
    calls,
    tricksWon,
    currentSeat: leadSeat,
    leadSeat,
    trick: [],
    trickNumber: 1,
    trump,
    powerCard,
    lastTrickWinner: null,
    holdUntil: showing ? Date.now() + POWER_MS : null,
    decks,
    log: [...state.log.slice(-20), `Deal ${state.round + 1} of ${state.totalRounds}.`, trumpLine(state.trumpMode, trump, powerCard)],
  };
}

export function hideCallBreak(state: CallBreakState, viewerSeat: number | null): CallBreakState {
  const hands: Record<number, Card[]> = {};
  for (const [k, cards] of Object.entries(state.hands)) {
    const seat = Number(k);
    hands[seat] =
      viewerSeat === seat
        ? cards
        : cards.map((c, i) => ({ id: `hidden-${seat}-${i}`, suit: "S", rank: "A" }));
  }
  return { ...state, hands };
}

export function applyCallBreak(
  state: CallBreakState,
  action: ClientAction,
  seat: number,
  n: number,
  names: string[]
): { state: CallBreakState; error?: string } {
  if (state.phase === "over") return { state, error: "Match is over." };

  if (action.type === "table.advance" && state.phase === "showPower") {
    return { state: { ...state, phase: "calling", holdUntil: null } };
  }

  if (action.type === "table.collect" && state.phase === "holding") {
    const winner = state.lastTrickWinner ?? state.currentSeat;
    if (state.trickNumber >= state.totalTricks) {
      const scored = scoreRound({ ...state, trick: [] }, n);
      const lines = Array.from({ length: n }, (_, i) => {
        const s = scored.roundScores[i];
        return `${names[i]} ${scored.calls[i]}/${scored.tricksWon[i]} → ${s >= 0 ? "+" : ""}${s}`;
      });
      return {
        state: {
          ...scored,
          phase: "roundEnd",
          trick: [],
          holdUntil: null,
          currentSeat: winner,
          log: [...state.log.slice(-16), ...lines],
        },
      };
    }
    return {
      state: {
        ...state,
        phase: "trick",
        trick: [],
        trickNumber: state.trickNumber + 1,
        currentSeat: winner,
        leadSeat: winner,
        lastTrickWinner: null,
        holdUntil: null,
      },
    };
  }

  if (state.phase === "roundEnd") {
    if (state.round >= state.totalRounds) {
      let winner = 0;
      for (let i = 1; i < n; i++) if (state.scores[i] > state.scores[winner]) winner = i;
      return {
        state: {
          ...state,
          phase: "over",
          winnerSeat: winner,
          log: [...state.log.slice(-24), `${names[winner]} takes the sitting.`],
        },
      };
    }
    return { state: nextDeal(state, n) };
  }

  if (state.phase === "holding" || state.phase === "showPower") {
    return { state, error: "Wait — the table is still showing." };
  }

  if (action.type === "callBreak.call") {
    if (state.phase !== "calling") return { state, error: "Not the calling phase." };
    if (seat !== state.currentSeat) return { state, error: "Not your call." };
    const tricks = action.tricks;
    if (!Number.isInteger(tricks) || tricks < 1 || tricks > 13) {
      return { state, error: "Call between 1 and 13." };
    }
    const calls = { ...state.calls, [seat]: tricks };
    const next = (seat - 1 + n) % n;
    const allIn = Object.values(calls).every((c) => c !== null);
    const log = `${names[seat]} calls ${tricks}.`;
    if (allIn) {
      return {
        state: {
          ...state,
          phase: "trick",
          calls,
          currentSeat: state.leadSeat,
          log: [...state.log.slice(-24), log, "Tricks are live."],
        },
      };
    }
    return { state: { ...state, calls, currentSeat: next, log: [...state.log.slice(-24), log] } };
  }

  if (action.type !== "callBreak.play") return { state, error: "Unknown action." };
  if (state.phase !== "trick") return { state, error: "Not playing tricks." };
  if (seat !== state.currentSeat) return { state, error: "Not your turn." };

  const hand = state.hands[seat];
  const card = hand.find((c) => c.id === action.cardId);
  if (!card) return { state, error: "Card not in hand." };
  const legal = legalCallBreakCards(state, seat);
  if (!legal.some((c) => c.id === card.id)) return { state, error: "Must follow suit." };

  let trump = state.trump;
  let logExtra: string | null = null;
  const ledSuit = state.trick[0]?.card.suit;
  if (ledSuit && !hand.some((c) => c.suit === ledSuit) && !trump && state.trumpMode === "cut") {
    trump = card.suit;
    logExtra = `${names[seat]} cuts — trump is ${SUIT_NAME[trump]}.`;
  }

  const trick = [...state.trick, { seat, card }];
  const hands = { ...state.hands, [seat]: hand.filter((c) => c.id !== card.id) };

  if (trick.length < n) {
    return {
      state: {
        ...state,
        hands,
        trick,
        trump,
        currentSeat: (seat - 1 + n) % n,
        log: logExtra ? [...state.log.slice(-24), logExtra] : state.log,
      },
    };
  }

  const led = trick[0].card.suit;
  const winner = trickWinner(trick, led, trump);
  const tricksWon = { ...state.tricksWon, [winner]: state.tricksWon[winner] + 1 };
  const log = `${names[winner]} takes the trick.`;
  return {
    state: {
      ...state,
      phase: "holding",
      hands,
      trick,
      trump,
      tricksWon,
      lastTrickWinner: winner,
      holdUntil: Date.now() + HOLD_MS,
      currentSeat: winner,
      log: [...state.log.slice(-24), ...(logExtra ? [logExtra] : []), log],
    },
  };
}
