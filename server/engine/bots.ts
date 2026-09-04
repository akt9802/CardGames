import { rankValue, type Card, type Rank, RANKS } from "../../shared/cards.ts";
import type { BluffState, CallBreakState, ClientAction, GameState, MendiState } from "../../shared/types.ts";
import { legalCallBreakCards } from "./callBreak.ts";
import { botCabo } from "./cabo.ts";
import { legalMendiCards, teamOf } from "./mendi.ts";

function pick<T>(arr: T[], rng = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

function countRank(hand: Card[], rank: Rank): Card[] {
  return hand.filter((c) => c.rank === rank);
}

export function botBluff(state: BluffState, seat: number): ClientAction {
  const hand = state.hands[seat];
  const max = Math.min(state.maxPlay, hand.length);
  const cap = state.decks * 4;

  if (state.phase === "challenge" && state.lastPlay && state.lastPlay.seat !== seat) {
    const claimed = state.lastPlay.claimedRank;
    const held = countRank(hand, claimed).length;
    const need = state.lastPlay.count;
    if (held + need > cap) return { type: "bluff.call" };
    if (need >= 3 && held >= 1) return { type: "bluff.call" };
    if (need >= 4) return { type: "bluff.call" };
    if (state.hands[state.lastPlay.seat].length === 0) return { type: "bluff.call" };
    if (Math.random() < 0.12) return { type: "bluff.call" };
    return { type: "bluff.pass" };
  }

  if (state.phase === "lead") {
    const groups = RANKS.map((r) => ({ r, cards: countRank(hand, r) }))
      .filter((g) => g.cards.length)
      .sort((a, b) => b.cards.length - a.cards.length);
    const best = groups[0];
    if (best && (best.cards.length >= 2 || Math.random() < 0.7)) {
      return { type: "bluff.play", cardIds: best.cards.slice(0, max).map((c) => c.id), claimedRank: best.r };
    }
    const junk = [...hand].sort((a, b) => rankValue(a.rank) - rankValue(b.rank)).slice(0, Math.min(2, max));
    const fake = pick(RANKS.filter((r) => countRank(hand, r).length === 0).concat(best?.r ?? "A"));
    return { type: "bluff.play", cardIds: junk.map((c) => c.id), claimedRank: fake };
  }

  if (state.phase === "follow" && state.currentRank) {
    const have = countRank(hand, state.currentRank);
    if (have.length) {
      const n = Math.random() < 0.5 ? 1 : have.length;
      return { type: "bluff.play", cardIds: have.slice(0, Math.min(n, max)).map((c) => c.id) };
    }
    if (state.pileCount > 10 || Math.random() < 0.55) return { type: "bluff.pass" };
    const n = Math.min(1 + (Math.random() < 0.2 ? 1 : 0), max, hand.length);
    return { type: "bluff.play", cardIds: hand.slice(0, n).map((c) => c.id) };
  }

  return { type: "bluff.pass" };
}

function callBreakBid(hand: Card[], trump: Card["suit"] | null): number {
  const t = trump ?? "S";
  let v = 0;
  const trumps = hand.filter((c) => c.suit === t);
  for (const c of hand) {
    if (c.suit === t) {
      if (c.rank === "A" || c.rank === "K") v += 1;
      else if (c.rank === "Q" || c.rank === "J") v += 0.7;
      else v += 0.28;
    } else if (c.rank === "A") v += 0.75;
    else if (c.rank === "K") v += 0.35;
  }
  if (trumps.length >= 5) v += 0.6;
  if (!trump) v = Math.max(1, Math.round(v * 0.7));
  return Math.max(1, Math.min(8, Math.round(v)));
}

function beats(a: Card, b: Card, led: Card["suit"], trump: Card["suit"] | null): boolean {
  const aT = trump !== null && a.suit === trump;
  const bT = trump !== null && b.suit === trump;
  if (aT && !bT) return true;
  if (!aT && bT) return false;
  if (a.suit === b.suit) return rankValue(a.rank) > rankValue(b.rank);
  if (a.suit === led && b.suit !== led && !bT) return true;
  return false;
}

function currentWinnerCard(trick: { card: Card }[], trump: Card["suit"] | null): Card {
  let best = trick[0].card;
  const led = trick[0].card.suit;
  for (let i = 1; i < trick.length; i++) {
    if (beats(trick[i].card, best, led, trump)) best = trick[i].card;
  }
  return best;
}

export function botCallBreak(state: CallBreakState, seat: number): ClientAction {
  const hand = state.hands[seat];
  if (state.phase === "calling") {
    return { type: "callBreak.call", tricks: callBreakBid(hand, state.trump) };
  }
  if (state.phase === "roundEnd") {
    return { type: "callBreak.play", cardId: hand[0]?.id ?? "" };
  }
  const legal = legalCallBreakCards(state, seat);
  if (!legal.length) return { type: "table.collect" };
  const need = (state.calls[seat] ?? 1) - state.tricksWon[seat];
  const want = need > 0;
  if (state.trick.length === 0) {
    const sorted = [...legal].sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
    if (want) {
      const ace = sorted.find((c) => c.rank === "A" && c.suit !== (state.trump ?? "S")) ?? sorted.find((c) => c.rank === "A");
      return { type: "callBreak.play", cardId: (ace ?? sorted[sorted.length - 1]).id };
    }
    return { type: "callBreak.play", cardId: sorted[0].id };
  }
  const winning = currentWinnerCard(state.trick, state.trump);
  const led = state.trick[0].card.suit;
  const winners = legal.filter((c) => beats(c, winning, led, state.trump)).sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
  const losers = legal.filter((c) => !beats(c, winning, led, state.trump)).sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
  if (want && winners.length) return { type: "callBreak.play", cardId: winners[0].id };
  if (losers.length) return { type: "callBreak.play", cardId: losers[0].id };
  return { type: "callBreak.play", cardId: legal[0].id };
}

export function botMendi(state: MendiState, seat: number): ClientAction {
  const hand = state.hands[seat];
  if (state.phase === "setTrump") {
    const bySuit: Record<string, Card[]> = { S: [], H: [], D: [], C: [] };
    for (const c of hand) bySuit[c.suit].push(c);
    const suit = (Object.entries(bySuit).sort((a, b) => {
      const sa = a[1].reduce((s, c) => s + rankValue(c.rank), 0);
      const sb = b[1].reduce((s, c) => s + rankValue(c.rank), 0);
      return sb - sa || b[1].length - a[1].length;
    })[0]?.[0] ?? "S") as Card["suit"];
    const tuck =
      bySuit[suit].find((c) => c.rank !== "10" && rankValue(c.rank) <= 9) ??
      bySuit[suit][bySuit[suit].length - 1] ??
      hand[0];
    return { type: "mendi.setTrump", cardId: tuck.id };
  }
  if (state.phase === "handEnd") {
    return { type: "mendi.play", cardId: hand[0]?.id ?? "" };
  }
  const legal = legalMendiCards(state, seat);
  const myTeam = teamOf(seat);
  if (state.trick.length === 0) {
    const ten = legal.find((c) => c.rank === "10" && state.trump && c.suit === state.trump);
    const high = [...legal].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0];
    const low = [...legal].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0];
    return { type: "mendi.play", cardId: (ten ?? (Math.random() < 0.4 ? high : low)).id };
  }
  const winning = currentWinnerCard(state.trick, state.trump);
  const led = state.trick[0].card.suit;
  const winnerSeat = state.trick.reduce((best, p) => {
    const b = state.trick.find((x) => x.card.id === winning.id);
    return b?.seat ?? best;
  }, state.trick[0].seat);
  const partnerWinning = teamOf(winnerSeat) === myTeam;
  const tensOnTable = state.trick.some((p) => p.card.rank === "10");
  const winners = legal.filter((c) => beatsMendi(c, winning, led, state.trump)).sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
  const dump = [...legal].sort((a, b) => {
    const at = a.rank === "10" ? 50 : 0;
    const bt = b.rank === "10" ? 50 : 0;
    return at - bt || rankValue(a.rank) - rankValue(b.rank);
  })[0];
  if (partnerWinning && !tensOnTable) return { type: "mendi.play", cardId: dump.id };
  if ((tensOnTable || !partnerWinning) && winners.length) {
    const withTen = winners.find((c) => c.rank === "10");
    return { type: "mendi.play", cardId: (withTen ?? winners[0]).id };
  }
  return { type: "mendi.play", cardId: dump.id };
}

function beatsMendi(a: Card, b: Card, led: Card["suit"], trump: Card["suit"] | null): boolean {
  const aT = trump !== null && a.suit === trump;
  const bT = trump !== null && b.suit === trump;
  if (aT && !bT) return true;
  if (!aT && bT) return false;
  if (a.suit === b.suit) return rankValue(a.rank) > rankValue(b.rank);
  if (a.suit === led && b.suit !== led && !bT) return true;
  return false;
}

export function botAction(state: GameState, seat: number): ClientAction | null {
  if (state.game === "bluff") {
    if (state.phase === "over") return null;
    if (state.phase === "challenge" && state.lastPlay?.seat === seat) return null;
    return botBluff(state, seat);
  }
  if (state.game === "callBreak") {
    if (state.phase === "over" || state.phase === "holding" || state.phase === "showPower") return null;
    if (state.phase === "calling" || state.phase === "trick" || state.phase === "roundEnd") {
      return botCallBreak(state, seat);
    }
    return null;
  }
  if (state.game === "cabo") return botCabo(state, seat);
  if (state.phase === "over" || state.phase === "holding" || state.phase === "showPower") return null;
  if (state.phase === "setTrump" || state.phase === "trick" || state.phase === "handEnd") {
    return botMendi(state, seat);
  }
  return null;
}
