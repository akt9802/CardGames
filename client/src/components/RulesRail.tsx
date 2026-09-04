import { RULES } from "@shared/rules.ts";
import type { GameId } from "@shared/types.ts";

export function RulesRail({
  game,
  collapsed,
  onToggle,
}: {
  game: GameId;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const r = RULES[game];
  return (
    <aside className={`rules ${collapsed ? "collapsed-rail" : ""}`}>
      <h2>
        {onToggle ? (
          <button className="rail-toggle" type="button" onClick={onToggle} title={collapsed ? "Open rules" : "Hide rules"}>
            {collapsed ? "‹" : "›"}
          </button>
        ) : null}
        {collapsed ? <span className="rail-label">Rules</span> : r.title}
      </h2>
      {collapsed ? null : (
        <article>
          {r.sections.map((s) => (
            <div key={s.h}>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </div>
          ))}
        </article>
      )}
    </aside>
  );
}
