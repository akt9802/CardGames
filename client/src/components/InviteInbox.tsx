import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { TableInvite } from "@shared/types.ts";
import { apiJson, connect, loadSession } from "../session.ts";

export function InviteInbox() {
  const nav = useNavigate();
  const session = loadSession();
  const [invites, setInvites] = useState<TableInvite[]>([]);

  useEffect(() => {
    if (!session) return;
    apiJson<{ invites: TableInvite[] }>("/api/invites", undefined, session.token)
      .then((d) => setInvites(d.invites))
      .catch(() => undefined);
    const s = connect(session.token);
    const onInvite = (inv: TableInvite) => {
      setInvites((cur) => [inv, ...cur.filter((x) => x.id !== inv.id)].slice(0, 20));
    };
    s.on("invite:incoming", onInvite);
    return () => {
      s.off("invite:incoming", onInvite);
    };
  }, [session?.token]);

  if (!session || invites.length === 0) return null;

  async function dismiss(id: string) {
    await apiJson(`/api/invites/${id}/dismiss`, {}, session!.token);
    setInvites((cur) => cur.filter((x) => x.id !== id));
  }

  return (
    <div className="invite-stack">
      {invites.slice(0, 3).map((inv) => (
        <article className="invite-card" key={inv.id}>
          <span className="mini-portrait">
            {inv.fromPhoto ? <img src={inv.fromPhoto} alt="" /> : inv.fromName.slice(0, 1)}
          </span>
          <div>
            <strong>
              {inv.fromId ? (
                <Link className="quiet-link" to={`/people/${inv.fromId}`}>
                  {inv.fromName}
                </Link>
              ) : (
                inv.fromName
              )}
            </strong>
            <p>
              {inv.kind === "ping"
                ? inv.roomCode
                  ? `Pinged you toward table ${inv.roomCode}.`
                  : "Pinged you — the parlor is open."
                : `Invited you to table ${inv.roomCode}. Any of the four games can be dealt there.`}
            </p>
          </div>
          <div className="invite-actions">
            {inv.roomId ? (
              <button
                className="btn solid"
                type="button"
                onClick={async () => {
                  await dismiss(inv.id);
                  nav(`/table/${inv.roomId}`);
                }}
              >
                Sit
              </button>
            ) : (
              <button
                className="btn solid"
                type="button"
                onClick={async () => {
                  await dismiss(inv.id);
                  nav("/people");
                }}
              >
                See who
              </button>
            )}
            <button className="btn ghost" type="button" onClick={() => dismiss(inv.id)}>
              Later
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
