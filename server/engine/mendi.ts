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
import type { ClientAction, MendiState, TeamId, TrumpMode } from "../../shared/types.ts";

export function teamOf(seat: number): TeamId {
  return seat % 2 === 0 ? "A" : "B";
}

export function createMendi(seats: number, handsToWin = 5, trumpMode: TrumpMode = "classic"): MendiState {
  const strip = seats === 6 ? (["2"] as const) : [];
  const deck = shuffle(makeDeck(1, [...strip]));
  const totalTricks = deck.length / seats;
  let powerCard: Card | null = null;
  let trump: Suit | null = null;
  let trumpRevealed = false;
  if (trumpMode === "power") {
    powerCard = deck[0];
    trump = powerCard.suit;
    trumpRevealed = true;
  }
  const handsArr = dealEven(deck, seats);
  const hands: Record<number, Card[]> = {};
  handsArr.forEach((h, i) => {
    hands[i] = sortHand(h);
  });
  const dealerSeat = 0;
  const trumpSetterSeat = (dealerSeat - 1 + seats) % seats;
  const needSet = trumpMode === "classic";
  const showing = trumpMode === "power";
  return {
    game: "mendi",
    phase: showing ? "showPower" : needSet ? "setTrump" : "trick",
    handNumber: 1,
    handsToWin,
    dealerSeat,
    trumpSetterSeat,
    hands,
    hiddenTrump: null,
    trumpMode,
    trump,
    trumpRevealed,
    powerCard,
    currentSeat: trumpSetterSeat,
    leadSeat: trumpSetterSeat,
    trick: [],
    trickNumber: 1,
    totalTricks,
    teamTricks: { A: 0, B: 0 },
    teamTens: { A: [], B: [] },
    teamHands: { A: 0, B: 0 },
    lastResult: null,
    lastTrickWinner: null,
    holdUntil: showing ? Date.now() + POWER_MS : null,
    winnerTeam: null,
    log: [
      seats === 6 ? "3v3. Twos stripped. 8 cards each." : "2v2. Partners sit opposite.",
      mendiTrumpLine(trumpMode, trump),
    ],
  };
}

function mendiTrumpLine(mode: TrumpMode, trump: Suit | null) {
  if (mode === "classic") return "Closed trump: tuck a card. It flips on the first void.";
  if (mode === "power" && trump) return `Power card cut — trump is ${SUIT_NAME[trump]}.`;
  return "Cut hukum: the first void play sets trump for the hand.";
}

function trickWinner(trick: { seat: number; card: Card }[], led: Suit, trump: Suit | null): number {
  let bestI = 0;
  for (let i = 1; i < trick.length; i++) {
    const p = trick[i].card;
    const b = trick[bestI].card;
    const pTrump = trump !== null && p.suit === trump;
    const bTrump = trump !== null && b.suit === trump;
    if (pTrump && !bTrump) {
      bestI = i;
      continue;
    }
    if (!pTrump && bTrump) continue;
    if (p.suit === b.suit && rankValue(p.rank) > rankValue(b.rank)) bestI = i;
  }
  return trick[bestI].seat;
}

export function legalMendiCards(state: MendiState, seat: number): Card[] {
  const hand = state.hands[seat] ?? [];
  if (state.phase === "holding" || state.phase === "showPower") return [];
  if (state.trick.length === 0) return hand;
  const led = state.trick[0].card.suit;
  const ofLed = hand.filter((c) => c.suit === led);
  return ofLed.length ? ofLed : hand;
}

function describeResult(tensA: number, tensB: number, tricksA: number, tricksB: number, total: number) {
  if (tensA === 4) return tricksA === total ? "Team A whitewash — every trick, every ten." : "Team A Mendicot — all four tens.";
  if (tensB === 4) return tricksB === total ? "Team B whitewash — every trick, every ten." : "Team B Mendicot — all four tens.";
  if (tensA >= 3) return `Team A takes the hand with ${tensA} tens.`;
  if (tensB >= 3) return `Team B takes the hand with ${tensB} tens.`;
  if (tricksA > tricksB) return `Tens split 2–2. Team A wins on tricks ${tricksA}–${tricksB}.`;
  if (tricksB > tricksA) return `Tens split 2–2. Team B wins on tricks ${tricksB}–${tricksA}.`;
  return "Tens and tricks split. Drawn hand.";
}

function nextHand(state: MendiState, n: number, nextDealer: number): MendiState {
  const strip = n === 6 ? (["2"] as const) : [];
  const deck = shuffle(makeDeck(1, [...strip]));
  let powerCard: Card | null = null;
  let trump: Suit | null = null;
  let trumpRevealed = false;
  if (state.trumpMode === "power") {
    powerCard = deck[0];
    trump = powerCard.suit;
    trumpRevealed = true;
  }
  const handsArr = dealEven(deck, n);
  const hands: Record<number, Card[]> = {};
  handsArr.forEach((h, i) => {
    hands[i] = sortHand(h);
  });
  const trumpSetterSeat = (nextDealer - 1 + n) % n;
  const needSet = state.trumpMode === "classic";
  const showing = state.trumpMode === "power";
  return {
    ...state,
    phase: showing ? "showPower" : needSet ? "setTrump" : "trick",
    handNumber: state.handNumber + 1,
    dealerSeat: nextDealer,
    trumpSetterSeat,
    hands,
    hiddenTrump: null,
    trump,
    trumpRevealed,
    powerCard,
    currentSeat: trumpSetterSeat,
    leadSeat: trumpSetterSeat,
    trick: [],
    trickNumber: 1,
    totalTricks: deck.length / n,
    teamTricks: { A: 0, B: 0 },
    teamTens: { A: [], B: [] },
    lastResult: state.lastResult,
    lastTrickWinner: null,
    holdUntil: showing ? Date.now() + POWER_MS : null,
    log: [...state.log.slice(-20), `Hand ${state.handNumber + 1}.`, mendiTrumpLine(state.trumpMode, trump)],
  };
}

export function hideMendi(state: MendiState, viewerSeat: number | null): MendiState {
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
    hiddenTrump: !state.hiddenTrump
      ? null
      : viewerSeat === state.trumpSetterSeat
        ? state.hiddenTrump
        : { id: "hidden-trump", suit: "S", rank: "A" },
  };
}

export function applyMendi(
  state: MendiState,
  action: ClientAction,
  seat: number,
  n: number,
  names: string[]
): { state: MendiState; error?: string } {
  if (state.phase === "over") return { state, error: "Match is over." };

  if (action.type === "table.advance" && state.phase === "showPower") {
    return { state: { ...state, phase: "trick", holdUntil: null, currentSeat: state.trumpSetterSeat } };
  }

  if (action.type === "table.collect" && state.phase === "holding") {
    const winner = state.lastTrickWinner ?? state.currentSeat;
    if (state.trickNumber >= state.totalTricks) {
      const tensA = state.teamTens.A.length;
      const tensB = state.teamTens.B.length;
      const result = describeResult(tensA, tensB, state.teamTricks.A, state.teamTricks.B, state.totalTricks);
      const teamHands = { ...state.teamHands };
      let winnerTeam: TeamId | null = state.winnerTeam;
      if (result.startsWith("Team A")) {
        teamHands.A += 1;
        if (teamHands.A >= state.handsToWin) winnerTeam = "A";
      } else if (result.startsWith("Team B")) {
        teamHands.B += 1;
        if (teamHands.B >= state.handsToWin) winnerTeam = "B";
      }
      const endLog = winnerTeam ? `Team ${winnerTeam} wins the sitting ${teamHands.A}–${teamHands.B}.` : result;
      return {
        state: {
          ...state,
          phase: winnerTeam ? "over" : "handEnd",
          trick: [],
          holdUntil: null,
          teamHands,
          lastResult: result,
          winnerTeam,
          currentSeat: winner,
          log: [...state.log.slice(-16), endLog],
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

  if (state.phase === "holding" || state.phase === "showPower") {
    return { state, error: "Wait — the table is still showing." };
  }

  if (state.phase === "handEnd") {
    if (state.winnerTeam) {
      return { state: { ...state, phase: "over" } };
    }
    const dealerWon = !state.lastResult?.includes(teamOf(state.dealerSeat) === "A" ? "Team B" : "Team A");
    const whitewash = (state.lastResult ?? "").toLowerCase().includes("whitewash");
    let nextDealer = (state.dealerSeat - 1 + n) % n;
    if (dealerWon && whitewash) nextDealer = (state.dealerSeat + 2) % n;
    else if (!state.lastResult?.includes("Team")) nextDealer = (state.dealerSeat - 1 + n) % n;
    else if (state.lastResult.includes(`Team ${teamOf(state.dealerSeat)}`)) nextDealer = (state.dealerSeat - 1 + n) % n;
    else nextDealer = state.dealerSeat;
    return { state: nextHand(state, n, nextDealer) };
  }

  if (action.type === "mendi.setTrump") {
    if (state.phase !== "setTrump") return { state, error: "Trump is already set." };
    if (seat !== state.trumpSetterSeat) return { state, error: "Only the player to the dealer’s right sets trump." };
    const hand = state.hands[seat];
    const card = hand.find((c) => c.id === action.cardId);
    if (!card) return { state, error: "Card not in hand." };
    return {
      state: {
        ...state,
        phase: "trick",
        hiddenTrump: card,
        hands: { ...state.hands, [seat]: hand.filter((c) => c.id !== card.id) },
        currentSeat: seat,
        log: [...state.log.slice(-24), `${names[seat]} tucks a closed trump.`],
      },
    };
  }

  if (action.type !== "mendi.play") return { state, error: "Unknown action." };
  if (state.phase !== "trick") return { state, error: "Not playing tricks." };
  if (seat !== state.currentSeat) return { state, error: "Not your turn." };

  let working = state;
  let hand = working.hands[seat];
  const card = hand.find((c) => c.id === action.cardId);
  if (!card) return { state, error: "Card not in hand." };

  const ledSuit = working.trick[0]?.card.suit;
  if (ledSuit) {
    const canFollow = hand.some((c) => c.suit === ledSuit);
    if (canFollow && card.suit !== ledSuit) return { state, error: "Must follow suit." };
    if (!canFollow && working.hiddenTrump && !working.trumpRevealed) {
      const hidden = working.hiddenTrump;
      const setter = working.trumpSetterSeat;
      const restored = sortHand([...working.hands[setter], hidden]);
      working = {
        ...working,
        trump: hidden.suit,
        trumpRevealed: true,
        hiddenTrump: null,
        hands: { ...working.hands, [setter]: restored },
        log: [...working.log.slice(-24), `Trump is ${SUIT_NAME[hidden.suit]}.`],
      };
      hand = working.hands[seat];
      if (!hand.some((c) => c.id === card.id)) {
        return { state: working, error: "That card moved with the trump reveal — pick again." };
      }
    } else if (!canFollow && !working.trump && working.trumpMode === "cut") {
      working = {
        ...working,
        trump: card.suit,
        trumpRevealed: true,
        log: [...working.log.slice(-24), `${names[seat]} cuts — trump is ${SUIT_NAME[card.suit]}.`],
      };
    }
  }

  const trick = [...working.trick, { seat, card }];
  const hands = { ...working.hands, [seat]: hand.filter((c) => c.id !== card.id) };

  if (trick.length < n) {
    return {
      state: {
        ...working,
        hands,
        trick,
        currentSeat: (seat - 1 + n) % n,
      },
    };
  }

  const led = trick[0].card.suit;
  const winner = trickWinner(trick, led, working.trump);
  const wTeam = teamOf(winner);
  const tens = trick.filter((p) => p.card.rank === "10").map((p) => p.card);
  const teamTens = {
    ...working.teamTens,
    [wTeam]: [...working.teamTens[wTeam], ...tens],
  };
  const teamTricks = {
    ...working.teamTricks,
    [wTeam]: working.teamTricks[wTeam] + 1,
  };
  const tenNote = tens.length ? ` (${tens.length} ten${tens.length > 1 ? "s" : ""})` : "";
  const log = `${names[winner]} takes the trick${tenNote}.`;
  return {
    state: {
      ...working,
      phase: "holding",
      hands,
      trick,
      teamTens,
      teamTricks,
      lastTrickWinner: winner,
      holdUntil: Date.now() + HOLD_MS,
      currentSeat: winner,
      log: [...working.log.slice(-24), log],
    },
  };
}
