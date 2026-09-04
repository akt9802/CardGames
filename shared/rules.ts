import type { GameId } from "./types.ts";

export const RULES: Record<GameId, { title: string; sections: { h: string; p: string }[] }> = {
  bluff: {
    title: "How Bluff works",
    sections: [
      {
        h: "Goal",
        p: "Be first to empty your hand. Cards are played face-down. You may lie about what they are.",
      },
      {
        h: "The table",
        p: "3–5 players use one 52-card deck. 6–8 players use two decks shuffled together. Hands may be uneven by one card — that is fine.",
      },
      {
        h: "Leading a round",
        p: "The leader plays 1 or more cards face-down and names any rank (for example “three Queens”). That rank is now the round’s claim.",
      },
      {
        h: "Following",
        p: "Everyone else, in turn, must either play 1+ cards claiming that same rank, or pass. You do not have to tell the truth.",
      },
      {
        h: "Calling Bluff",
        p: "After a play, anyone else may tap Bluff before the next turn. The just-played cards are flipped. If any card is the wrong rank, the liar takes the whole pile. If every card matches, the accuser takes the pile.",
      },
      {
        h: "Passing",
        p: "If every other player passes after a play, the pile is swept aside (out of the game) and the next player leads a fresh rank.",
      },
      {
        h: "After a call",
        p: "The player after whoever picked up the pile leads the next round and names a new rank.",
      },
      {
        h: "Going out",
        p: "If your last cards leave your hand, the table still gets one chance to call Bluff. Survive that window and you win. Get caught and you pick up the pile.",
      },
    ],
  },
  callBreak: {
    title: "How Call Break works",
    sections: [
      {
        h: "Goal",
        p: "Over 3 or 5 deals (chosen when the table opens), score the most points by winning at least as many tricks as you called.",
      },
      {
        h: "The table",
        p: "4 players: one 52-card deck, 13 cards each, 13 tricks. 8 players: two decks (104 cards), 13 cards each, still 13 tricks. Duplicate cards can appear — if two identical cards meet, the one played first wins that comparison.",
      },
      {
        h: "Trump",
        p: "Pick a trump style before the sitting. Classic: Spades are always trump. Power card: after the shuffle a random card is shown — its suit is trump for that deal, then it is dealt with the rest. Cut: play starts with no trump. The first player who cannot follow suit ‘cuts’ — the suit they play becomes trump for the rest of the deal.",
      },
      {
        h: "Calling",
        p: "After the deal, each player calls 1–13 tricks they expect to win. There is no auction and you cannot pass. Play is counter-clockwise. The player to the dealer’s right calls and leads first.",
      },
      {
        h: "Following",
        p: "You must follow the led suit if you hold it. If you are void, you may play trump or discard any other suit. In cut mode there is no trump until that first void — the suit you play then becomes trump.",
      },
      {
        h: "Winning a trick",
        p: "Highest trump wins. If no trump was played, the highest card of the led suit wins. Identical twins (two-deck table): the one played first wins that comparison. Winner leads the next trick. The table holds the completed trick so everyone can see who took it.",
      },
      {
        h: "Scoring",
        p: "Make your call: score the call, plus 0.1 for each extra trick. Miss your call: score minus the full call (call 4, win 3 → −4). Extra tricks barely help — missing is brutal.",
      },
      {
        h: "Match",
        p: "Highest total after the last deal wins the table.",
      },
    ],
  },
  mendi: {
    title: "How Mendi Coat works",
    sections: [
      {
        h: "Goal",
        p: "Win the hand by capturing 3 or 4 of the four tens. Partners sit alternately around the table.",
      },
      {
        h: "The table",
        p: "4 players: 2v2, 13 cards each from a 52-card pack. 6 players: 3v3, the four 2s are stripped (48 cards), 8 cards each. Seat order is always A, B, A, B… so your partners are never beside you.",
      },
      {
        h: "Trump styles",
        p: "Closed (classic): the player to the dealer’s right tucks a card face-down; it flips on the first void. Power card: a random card is shown before play — that suit is trump and everyone sees it. Cut hukum: no trump until the first player who cannot follow; the suit they play becomes trump.",
      },
      {
        h: "Revealing trump",
        p: "In closed mode, the first void flips the tucked card and returns it to its owner. The void player may play anything. In cut mode, that same void sets trump from the card they choose to play.",
      },
      {
        h: "Tricks",
        p: "Follow suit if you can. Highest trump wins; if none, highest of the led suit. Winner leads next. Play is counter-clockwise.",
      },
      {
        h: "Who wins the hand",
        p: "3 or 4 tens: that team wins. All 4 tens is a Mendicot (Coat). If tens split 2–2, the team with more tricks wins (7+ of 13, or 5+ of 8). If tens and tricks both split, the hand is drawn.",
      },
      {
        h: "Whitewash",
        p: "Taking every trick in the hand is a Whitewash — the rarest result on the table.",
      },
      {
        h: "Match",
        p: "First team to 5 hands wins the sitting. Team chat is open for partners only.",
      },
    ],
  },
  cabo: {
    title: "How Cabo works",
    sections: [
      {
        h: "Goal",
        p: "End with the lowest pile. Ace is 1, Jack 11, Queen 12, King of diamonds 0, other Kings 13.",
      },
      {
        h: "Setup",
        p: "2–6 players. Four cards each, face-down in a two-by-two. Look at your bottom two once, then forget the table has faces.",
      },
      {
        h: "Turn",
        p: "Draw from the deck or the face-up discard. Then swap it with one of your cards, match it against known cards of the same rank, throw it away, or — if it came from the deck — spend it as a power.",
      },
      {
        h: "Matching",
        p: "A drawn card may eat any cards on the table of the same face. Matched cards are discarded. If you take someone else’s card, replace it with one of yours, unseen. A wrong guess costs a penalty card you may not look at. After matching, dump the drawn card to end the turn.",
      },
      {
        h: "Power ranks",
        p: "Seven or eight, know your fate: peek at one of your own. Nine or ten, know a friend: peek at someone else’s. Jack or Queen, switch between: swap any two cards on the table.",
      },
      {
        h: "Cabo",
        p: "On your turn, before drawing, you may call Cabo. Everyone else gets one more turn, then all cards flip. Lowest total wins. Emptying your last card also ends the sitting.",
      },
    ],
  },
};
