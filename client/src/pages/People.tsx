import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { UserPublic } from "@shared/types.ts";
import { BrandMark } from "../components/BrandMark.tsx";
import { InviteInbox } from "../components/InviteInbox.tsx";
import { apiJson, connect, emit, loadSession, logout } from "../session.ts";
import { instagramUrl } from "../instagram.ts";

type Person = UserPublic & { online: boolean; self: boolean };

export function People() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const tableId = params.get("table");
  const session = loadSession()!;
  const [people, setPeople] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");

  async function refresh() {
    const data = await apiJson<{ people: Person[] }>("/api/people", undefined, session.token);
    setPeople(data.people);
  }

  useEffect(() => {
    connect(session.token);
    refresh().catch((e) => setErr(e instanceof Error ? e.message : "Could not load the hall."));
  }, [session.token]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return people
      .filter((p) => !p.self)
      .filter(
        (p) =>
          !n ||
          p.displayName.toLowerCase().includes(n) ||
          p.username.toLowerCase().includes(n) ||
          (p.instagram ?? "").toLowerCase().includes(n)
      );
  }, [people, q]);

  function toggle(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function openAndInvite() {
    setErr("");
    setOk("");
    setBusy("invite");
    try {
      const ids = [...picked];
      if (tableId) {
        if (ids.length) await apiJson(`/api/rooms/${tableId}/invite`, { userIds: ids }, session.token);
        nav(`/table/${tableId}`);
        return;
      }
      const created = await emit<{ ok: boolean; error?: string; room?: { id: string } }>("room:create", {
        seats: 8,
        fillBots: false,
      });
      if (!created.ok || !created.room) throw new Error(created.error ?? "Could not open a table.");
      if (ids.length) {
        await apiJson(`/api/rooms/${created.room.id}/invite`, { userIds: ids }, session.token);
      }
      nav(`/table/${created.room.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not invite.");
    } finally {
      setBusy("");
    }
  }

  async function inviteOne(id: string) {
    setErr("");
    setOk("");
    setBusy(id);
    try {
      if (tableId) {
        await apiJson(`/api/rooms/${tableId}/invite`, { userIds: [id] }, session.token);
        setOk("Invite sent to the open table.");
        return;
      }
      const created = await emit<{ ok: boolean; error?: string; room?: { id: string } }>("room:create", {
        seats: 8,
        fillBots: false,
      });
      if (!created.ok || !created.room) throw new Error(created.error ?? "Could not open a table.");
      await apiJson(`/api/rooms/${created.room.id}/invite`, { userIds: [id] }, session.token);
      nav(`/table/${created.room.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not invite.");
    } finally {
      setBusy("");
    }
  }

  async function pingOne(id: string) {
    setErr("");
    setOk("");
    setBusy("ping-" + id);
    try {
      await apiJson(`/api/people/${id}/ping`, tableId ? { roomId: tableId } : {}, session.token);
      setOk("Ping sent.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not ping.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <header className="topbar">
        <Link className="mark" to="/lobby">
          <BrandMark kicker={session.user.displayName} />
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn" to="/lobby">
            Hall
          </Link>
          <Link className="btn" to="/profile">
            Profile
          </Link>
          <button
            className="btn ghost"
            type="button"
            onClick={async () => {
              await logout();
              nav("/");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="people-wrap">
        <InviteInbox />
        <div className="kicker">Who's in the parlor</div>
        <h1 className="display" style={{ fontSize: 44, marginBottom: 8 }}>
          People
        </h1>
        <p style={{ color: "var(--mist)", marginTop: 0 }}>
          Ping someone to come sit, or open a table and send an invite. Tap a name to open their chair — everyone in the parlor can see everyone else's profile.
        </p>
        <div className="people-toolbar">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search names"
            style={{
              flex: 1,
              background: "var(--ink)",
              border: "1px solid var(--line)",
              color: "var(--ivory)",
              padding: "10px 12px",
              borderRadius: 8,
            }}
          />
          <button className="btn solid" type="button" disabled={busy === "invite"} onClick={openAndInvite}>
            {busy === "invite"
              ? "Sending…"
              : tableId
                ? picked.size
                  ? `Invite ${picked.size} to this table`
                  : "Back to the table"
                : picked.size
                  ? `Open table & invite ${picked.size}`
                  : "Open an empty table"}
          </button>
        </div>
        <div className="err">{err}</div>
        {ok ? <p style={{ color: "var(--brass-2)" }}>{ok}</p> : null}
        <div className="people-list">
          {shown.length === 0 ? <p style={{ color: "var(--mist)" }}>No other chairs yet.</p> : null}
          {shown.map((p) => (
            <article className="person-row" key={p.id}>
              <div className="person-pick">
                <label>
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                </label>
                <div className="person-id">
                  <Link className="person-id-main quiet-link" to={tableId ? `/people/${p.id}?table=${tableId}` : `/people/${p.id}`}>
                    <span className="mini-portrait">
                      {p.photoUrl ? <img src={p.photoUrl} alt="" /> : p.displayName.slice(0, 1)}
                    </span>
                    <div>
                      <strong>{p.displayName}</strong>
                      <div className="mono" style={{ fontSize: 12, color: "var(--mist)" }}>
                        @{p.username}
                        {p.online ? " · in the hall" : ""}
                      </div>
                    </div>
                  </Link>
                  {p.instagram ? (
                    <a
                      className="ig-out"
                      href={instagramUrl(p.instagram)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      @{p.instagram}
                    </a>
                  ) : null}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link className="btn" to={tableId ? `/people/${p.id}?table=${tableId}` : `/people/${p.id}`}>
                  Profile
                </Link>
                <button className="btn" type="button" disabled={busy === "ping-" + p.id} onClick={() => pingOne(p.id)}>
                  Ping
                </button>
                <button className="btn solid" type="button" disabled={busy === p.id} onClick={() => inviteOne(p.id)}>
                  {tableId ? "Invite here" : "Invite to a table"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
