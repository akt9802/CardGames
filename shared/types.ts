import type { Card, Rank, Suit } from "./cards.ts";

export type GameId = "bluff" | "callBreak" | "mendi" | "cabo";
export type TeamId = "A" | "B";
export type TrumpMode = "classic" | "power" | "cut";

export interface UserPublic {
  id: string;
  username: string;
  displayName: string;
}

export interface Seat {
  index: number;
  playerId: string | null;
  name: string;
  isBot: boolean;
  ready: boolean;
  connected: boolean;
  team?: TeamId;
}

export interface ChatMessage {
  id: string;
  at: number;
  fromId: string;
  fromName: string;
  text: string;
  scope: "lobby" | "room" | "team";
  team?: TeamId;
}

export interface RoomConfig {
  game: GameId;
  seats: number;
  fillBots: boolean;
  mendiHandsToWin?: number;
  callBreakRounds?: 3 | 5;
  trumpMode?: TrumpMode;
}

export type RoomPhase = "lobby" | "playing" | "finished";

export interface LastPlay {
  seat: number;
  name: string;
  claimedRank: Rank;
  count: number;
  revealed?: Card[];
  wasBluff?: boolean;
}

export interface TrickPlay {
  seat: number;
  card: Card;
}

export interface BluffState {
  game: "bluff";
  phase: "lead" | "follow" | "challenge" | "over";
  hands: Record<number, Card[]>;
  pile: Card[];
  pileCount: number;
  currentSeat: number;
  currentRank: Rank | null;
  lastPlay: LastPlay | null;
  consecutivePasses: number;
  challengeUntil: number | null;
  winnerSeat: number | null;
  log: string[];
  decks: number;
  maxPlay: number;
}

export interface CallBreakState {
  game: "callBreak";
  phase: "showPower" | "calling" | "trick" | "holding" | "roundEnd" | "over";
  round: number;
  totalRounds: number;
  dealerSeat: number;
  hands: Record<number, Card[]>;
  calls: Record<number, number | null>;
  tricksWon: Record<number, number>;
  scores: Record<number, number>;
  roundScores: Record<number, number>;
  currentSeat: number;
  leadSeat: number;
  trick: TrickPlay[];
  trickNumber: number;
  totalTricks: number;
  trumpMode: TrumpMode;
  trump: Suit | null;
  powerCard: Card | null;
  lastTrickWinner: number | null;
  holdUntil: number | null;
  winnerSeat: number | null;
  log: string[];
  decks: number;
}

export interface MendiState {
  game: "mendi";
  phase: "showPower" | "setTrump" | "trick" | "holding" | "handEnd" | "over";
  handNumber: number;
  handsToWin: number;
  dealerSeat: number;
  trumpSetterSeat: number;
  hands: Record<number, Card[]>;
  hiddenTrump: Card | null;
  trumpMode: TrumpMode;
  trump: Suit | null;
  trumpRevealed: boolean;
  powerCard: Card | null;
  currentSeat: number;
  leadSeat: number;
  trick: TrickPlay[];
  trickNumber: number;
  totalTricks: number;
  teamTricks: Record<TeamId, number>;
  teamTens: Record<TeamId, Card[]>;
  teamHands: Record<TeamId, number>;
  lastResult: string | null;
  lastTrickWinner: number | null;
  holdUntil: number | null;
  winnerTeam: TeamId | null;
  log: string[];
}

export interface CaboState {
  game: "cabo";
  phase: "peek" | "turn" | "drawn" | "power" | "showing" | "giving" | "reveal" | "over";
  grids: Record<number, (Card | null)[]>;
  deck: Card[];
  deckCount: number;
  discard: Card[];
  drawn: Card | null;
  drawnFrom: "deck" | "discard" | null;
  currentSeat: number;
  peeked: Record<number, boolean>;
  caboCaller: number | null;
  turnsAfterCabo: number | null;
  powerKind: "peekSelf" | "peekOther" | "swap" | null;
  swapPick: { seat: number; slot: number }[];
  peekShow: { seat: number; slot: number } | null;
  pendingGive: { toSeat: number; emptySlot: number } | null;
  matchedThisTurn: boolean;
  holdUntil: number | null;
  lastActor: number | null;
  scores: Record<number, number> | null;
  winnerSeat: number | null;
  log: string[];
}

export type GameState = BluffState | CallBreakState | MendiState | CaboState;

export interface RoomPublic {
  id: string;
  code: string;
  hostId: string;
  config: RoomConfig;
  phase: RoomPhase;
  seats: Seat[];
  chat: ChatMessage[];
  game: GameState | null;
  youSeat: number | null;
}

export type ClientAction =
  | { type: "bluff.play"; cardIds: string[]; claimedRank?: Rank }
  | { type: "bluff.pass" }
  | { type: "bluff.call" }
  | { type: "callBreak.call"; tricks: number }
  | { type: "callBreak.play"; cardId: string }
  | { type: "mendi.setTrump"; cardId: string }
  | { type: "mendi.play"; cardId: string }
  | { type: "table.collect" }
  | { type: "table.advance" }
  | { type: "cabo.peekDone" }
  | { type: "cabo.draw"; from: "deck" | "discard" }
  | { type: "cabo.swap"; slot: number }
  | { type: "cabo.discardDrawn" }
  | { type: "cabo.power" }
  | { type: "cabo.look"; seat: number; slot: number }
  | { type: "cabo.match"; seat: number; slot: number }
  | { type: "cabo.give"; slot: number }
  | { type: "cabo.call" };

export const GAME_META: Record<
  GameId,
  {
    title: string;
    tag: string;
    blurb: string;
    minSeats: number;
    maxSeats: number;
    seatOptions: number[];
    teams: boolean;
    accent: string;
  }
> = {
  bluff: {
    title: "Bluff",
    tag: "Lie well. Catch better.",
    blurb: "Play cards face-down, claim a rank, and dare the table to call you out.",
    minSeats: 3,
    maxSeats: 8,
    seatOptions: [3, 4, 5, 6, 7, 8],
    teams: false,
    accent: "#E85D04",
  },
  callBreak: {
    title: "Call Break",
    tag: "Bid. Cut. Collect.",
    blurb: "Call your tricks. Spades, a random power card, or a live cut — you choose how trump is born.",
    minSeats: 4,
    maxSeats: 8,
    seatOptions: [4, 8],
    teams: false,
    accent: "#C9A227",
  },
  mendi: {
    title: "Mendi Coat",
    tag: "Hunt the tens.",
    blurb: "Partners, tens, and a trump that can stay closed, flash as a power card, or wait for the cut.",
    minSeats: 4,
    maxSeats: 6,
    seatOptions: [4, 6],
    teams: true,
    accent: "#C73E66",
  },
  cabo: {
    title: "Cabo",
    tag: "Remember. Then dump.",
    blurb: "Four face-down cards, a peek at two, and power ranks that let you look, spy, or swap. Lowest total wins.",
    minSeats: 2,
    maxSeats: 6,
    seatOptions: [2, 3, 4, 5, 6],
    teams: false,
    accent: "#7ec8c0",
  },
};

export const BOT_NAMES = [
  "Meera",
  "Kabir",
  "Ratan",
  "Lata",
  "Vikram",
  "Sona",
  "Dev",
  "Nila",
  "Arjun",
  "Zara",
];
