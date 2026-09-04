import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@shared/types.ts";

export function ChatPanel({
  messages,
  onSend,
  teamEnabled,
  roomLabel = "Table",
  collapsed,
  onToggle,
}: {
  messages: ChatMessage[];
  onSend: (text: string, team?: boolean) => void;
  teamEnabled?: boolean;
  roomLabel?: string;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const [tab, setTab] = useState<"room" | "team">("room");
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const shown = messages.filter((m) => (tab === "team" ? m.scope === "team" : m.scope !== "team"));

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [shown.length]);

  return (
    <aside className={`chat ${collapsed ? "collapsed-rail" : ""}`}>
      <header>
        {onToggle ? (
          <button className="rail-toggle" type="button" onClick={onToggle} title={collapsed ? "Open chat" : "Hide chat"}>
            {collapsed ? "›" : "‹"}
          </button>
        ) : null}
        {collapsed ? (
          <span className="rail-label">Chat</span>
        ) : (
          <>
            <button className={tab === "room" ? "on" : ""} onClick={() => setTab("room")} type="button">
              {roomLabel}
            </button>
            {teamEnabled ? (
              <button className={tab === "team" ? "on" : ""} onClick={() => setTab("team")} type="button">
                Partners
              </button>
            ) : null}
          </>
        )}
      </header>
      {collapsed ? null : (
        <>
          <div className="msgs" ref={scroller}>
            {shown.length === 0 ? (
              <div className="msg" style={{ color: "var(--mist)" }}>
                No talk yet. Keep it kind.
              </div>
            ) : null}
            {shown.map((m) => (
              <div className="msg" key={m.id}>
                <b>{m.fromName}</b> {m.text}
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              onSend(text.trim(), tab === "team");
              setText("");
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tab === "team" ? "Only your partners hear this" : `Message the ${roomLabel.toLowerCase()}`}
              maxLength={280}
            />
            <button className="btn" type="submit">
              Send
            </button>
          </form>
        </>
      )}
    </aside>
  );
}
