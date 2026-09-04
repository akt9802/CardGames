import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { UserPublic } from "@shared/types.ts";
import { BrandMark } from "../components/BrandMark.tsx";
import { InviteInbox } from "../components/InviteInbox.tsx";
import { apiJson, connect, emit, loadSession, logout } from "../session.ts";
import { instagramUrl } from "../instagram.ts";
import { Missing } from "./Missing.tsx";

type Person = UserPublic & { online: boolean; self: boolean };

export function PersonProfile() {
  const nav = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const tableId = params.get("table");
  const session = loadSession()!;
  const [person, setPerson] = useState<Person | null>(null);
  const [err, setErr] = useState("");
  const [missing, setMissing] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!id) return;
    connect(session.token);
    apiJson<{ user: Person }>(`/api/people/${id}`, undefined, session.token)
      .then((d) => {
        setPerson(d.user);
        setMissing("");
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Could not open that chair.";
        if (msg === "No chair with that name.") setMissing(msg);
        else setErr(msg);
      });
  }, [id, session.token]);

  async function invite() {
    if (!person) return;
    setErr("");
    setOk("");
    setBusy("invite");
    try {
      if (tableId) {
        await apiJson(`/api/rooms/${tableId}/invite`, { userIds: [person.id] }, session.token);
        nav(`/table/${tableId}`);
        return;
      }
      const created = await emit<{ ok: boolean; error?: string; room?: { id: string } }>("room:create", {
        seats: 8,
        fillBots: false,
      });
      if (!created.ok || !created.room) throw new Error(created.error ?? "Could not open a table.");
      await apiJson(`/api/rooms/${created.room.id}/invite`, { userIds: [person.id] }, session.token);
      nav(`/table/${created.room.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not invite.");
    } finally {
      setBusy("");
    }
  }

  async function ping() {
    if (!person) return;
    setErr("");
    setOk("");
    setBusy("ping");
    try {
      await apiJson(`/api/people/${person.id}/ping`, tableId ? { roomId: tableId } : {}, session.token);
      setOk("Ping sent.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not ping.");
    } finally {
      setBusy("");
    }
  }

  const ig = person?.instagram ? instagramUrl(person.instagram) : "";

  if (missing) {
    return (
      <Missing
        kicker="No chair"
        title="That chair is empty"
        detail="Nobody in this parlor sits under that name. The hall still has people at the tables."
        home="/people"
        homeLabel="Back to people"
      />
    );
  }

  return (
    <>
      <header className="topbar">
        <Link className="mark" to="/lobby">
          <BrandMark kicker={session.user.displayName} />
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn" to={tableId ? `/people?table=${tableId}` : "/people"}>
            People
          </Link>
          <Link className="btn" to="/profile">
            Your chair
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
      <div className="profile-wrap">
        <InviteInbox />
        <div className="kicker">In the parlor</div>
        <h1 className="display" style={{ fontSize: 44, marginBottom: 8 }}>
          {person?.displayName ?? "Chair"}
        </h1>
        {person ? (
          <div className="public-chair">
            <div className="portrait lg">
              {person.photoUrl ? <img src={person.photoUrl} alt="" /> : <span>{person.displayName.slice(0, 1)}</span>}
            </div>
            <p className="mono" style={{ color: "var(--mist)", fontSize: 13, margin: "12px 0 4px" }}>
              @{person.username}
              {person.online ? " · in the hall" : ""}
            </p>
            {ig ? (
              <a className="ig-out" href={ig} target="_blank" rel="noopener noreferrer">
                @{person.instagram}
              </a>
            ) : (
              <p style={{ color: "var(--mist)", fontSize: 14 }}>No Instagram on this chair.</p>
            )}
            <div className="err">{err}</div>
            {ok ? <p style={{ color: "var(--brass-2)" }}>{ok}</p> : null}
            {person.self ? (
              <Link className="btn solid" to="/profile" style={{ marginTop: 16 }}>
                Edit your chair
              </Link>
            ) : (
              <div className="otp-actions" style={{ marginTop: 16 }}>
                <button className="btn" type="button" disabled={busy === "ping"} onClick={() => void ping()}>
                  {busy === "ping" ? "…" : "Ping"}
                </button>
                <button className="btn solid" type="button" disabled={busy === "invite"} onClick={() => void invite()}>
                  {busy === "invite" ? "Sending…" : tableId ? "Invite here" : "Invite to a table"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <p style={{ color: "var(--mist)" }}>{err || "Opening chair…"}</p>
        )}
      </div>
    </>
  );
}
