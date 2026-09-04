import { isRed, SUIT_GLYPH, type Card } from "@shared/cards.ts";

export function PlayingCard({
  card,
  back,
  selected,
  illegal,
  tiny,
  onClick,
}: {
  card?: Card;
  back?: boolean;
  selected?: boolean;
  illegal?: boolean;
  tiny?: boolean;
  onClick?: () => void;
}) {
  const cls = [
    "pcard",
    back ? "back" : card && isRed(card.suit) ? "red" : "",
    selected ? "sel" : "",
    illegal ? "illegal" : "",
    tiny ? "tiny" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (back || !card) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-label="Face-down card">
        <span className="pip">♠</span>
      </button>
    );
  }

  return (
    <button type="button" className={cls} onClick={onClick} aria-label={`${card.rank} of ${card.suit}`}>
      <span className="corner">
        {card.rank}
        <small>{SUIT_GLYPH[card.suit]}</small>
      </span>
      <span className="pip">{SUIT_GLYPH[card.suit]}</span>
    </button>
  );
}
