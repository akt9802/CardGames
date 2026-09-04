import type { Card } from "./cards.ts";
import type { CallBreakState, MendiState } from "./types.ts";

export function legalFollow(hand: Card[], trick: { card: Card }[]): Card[] {
  if (!trick.length) return hand;
  const led = trick[0].card.suit;
  const ofLed = hand.filter((c) => c.suit === led);
  return ofLed.length ? ofLed : hand;
}

export function legalCallBreak(state: CallBreakState, seat: number): Card[] {
  if (state.phase === "holding" || state.phase === "showPower") return [];
  return legalFollow(state.hands[seat] ?? [], state.trick);
}

export function legalMendi(state: MendiState, seat: number): Card[] {
  if (state.phase === "holding" || state.phase === "showPower") return [];
  return legalFollow(state.hands[seat] ?? [], state.trick);
}
