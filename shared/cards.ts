export type Suit = "S" | "H" | "D" | "C";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const RANKS: Rank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

export const SUIT_GLYPH: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

export const SUIT_NAME: Record<Suit, string> = {
  S: "Spades",
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
};

export const RANK_NAME: Record<Rank, string> = {
  A: "Ace",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  "10": "Ten",
  J: "Jack",
  Q: "Queen",
  K: "King",
};

const RANK_VALUE: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export function rankValue(rank: Rank): number {
  return RANK_VALUE[rank];
}

export function nextRank(rank: Rank): Rank {
  return RANKS[(RANKS.indexOf(rank) + 1) % RANKS.length];
}

export function isRed(suit: Suit): boolean {
  return suit === "H" || suit === "D";
}

export function makeDeck(decks = 1, stripRanks: Rank[] = []): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        if (stripRanks.includes(rank)) continue;
        cards.push({ id: `${d}-${suit}-${rank}`, suit, rank });
      }
    }
  }
  return cards;
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function dealEven(cards: Card[], seats: number): Card[][] {
  const hands: Card[][] = Array.from({ length: seats }, () => []);
  cards.forEach((card, i) => {
    hands[i % seats].push(card);
  });
  return hands;
}

export function sortHand(cards: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
  return [...cards].sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
    return rankValue(b.rank) - rankValue(a.rank);
  });
}

export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_GLYPH[card.suit]}`;
}

export function caboValue(card: Card): number {
  if (card.rank === "A") return 1;
  if (card.rank === "J") return 11;
  if (card.rank === "Q") return 12;
  if (card.rank === "K") return card.suit === "D" ? 0 : 13;
  return Number(card.rank);
}

export const HOLD_MS = 3000;
export const POWER_MS = 3200;
export const PEEK_MS = 2400;

export function pluralRank(rank: Rank, n: number): string {
  const name = RANK_NAME[rank];
  if (n === 1) return `1 ${name}`;
  if (rank === "6") return `${n} Sixes`;
  return `${n} ${name}s`;
}
