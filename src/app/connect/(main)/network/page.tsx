import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { listBlocked, listConnections, listInvitations, listSentRequests, suggestMembers } from "@/modules/connect/service";
import { connectAction, removeConnectionAction, respondAction, unblockAction } from "../../actions";
import { Avatar, Flash } from "../../ui";

export const metadata: Metadata = { title: "My network" };

function Person({ id, name, line, children }: { id: string; name: string; line?: string | null; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <Link href={`/connect/members/${id}`} className="flex min-w-0 items-center gap-3">
        <Avatar name={name} />
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold hover:underline">{name}</span>
          {line && <span className="truncate text-[13px] text-muted">{line}</span>}
        </span>
      </Link>
      <span className="flex gap-2">{children}</span>
    </li>
  );
}

export default async function Network({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [invites, sent, connections, suggestions, blocked, sp] = await Promise.all([
    listInvitations(me.id),
    listSentRequests(me.id),
    listConnections(me.id),
    suggestMembers(me.id, 12),
    listBlocked(me.id),
    searchParams,
  ]);
  const back = <input type="hidden" name="back" value="/connect/network" />;
  return (
    <>
      <h1 className="text-[26px] font-bold">My network</h1>
      <Flash msg={sp.msg} error={sp.error} />
      {invites.length > 0 && (
        <section className="card p-5">
          <h2 className="font-bold">Invitations ({invites.length})</h2>
          <ul className="divide-y divide-line">
            {invites.map((i) => (
              <Person key={i.id} id={i.fromUserId} name={i.name} line={i.headline}>
                <form action={respondAction}>{back}<input type="hidden" name="connectionId" value={i.id} /><input type="hidden" name="accept" value="1" /><button className="btn-primary min-h-10 px-4 text-sm">Accept</button></form>
                <form action={respondAction}>{back}<input type="hidden" name="connectionId" value={i.id} /><input type="hidden" name="accept" value="0" /><button className="btn-outline min-h-10 px-4 text-sm">Ignore</button></form>
              </Person>
            ))}
          </ul>
        </section>
      )}
      <section className="card p-5">
        <h2 className="font-bold">People you may know</h2>
        {suggestions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No suggestions yet. Add interests and your city to your profile.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 pt-3">
            {suggestions.map((s) => (
              <li key={s.id} className="flex flex-col items-start gap-2 rounded-2xl border border-line p-4">
                <Link href={`/connect/members/${s.id}`} className="flex items-center gap-3">
                  <Avatar name={s.name} size={44} />
                  <span className="flex flex-col">
                    <span className="font-semibold hover:underline">{s.name}</span>
                    <span className="text-[13px] text-muted">{s.headline || "Member"}</span>
                  </span>
                </Link>
                <span className="text-[12.5px] text-muted">{s.reason}</span>
                <form action={connectAction}>{back}<input type="hidden" name="userId" value={s.id} /><button className="btn-outline min-h-9 px-4 text-sm">Connect</button></form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card p-5">
        <h2 className="font-bold">Connections ({connections.length})</h2>
        {connections.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No connections yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {connections.map((c) => (
              <Person key={c.id} id={c.id} name={c.name} line={[c.headline, c.city].filter(Boolean).join(" · ")}>
                <Link href={`/connect/messages?to=${c.id}`} className="btn-outline min-h-10 px-4 text-sm">Message</Link>
              </Person>
            ))}
          </ul>
        )}
      </section>
      {sent.length > 0 && (
        <section className="card p-5">
          <h2 className="font-bold">Requests you sent</h2>
          <ul className="divide-y divide-line">
            {sent.map((s) => (
              <Person key={s.id} id={s.userId} name={s.name} line={s.headline}>
                <form action={removeConnectionAction}>{back}<input type="hidden" name="userId" value={s.userId} /><input type="hidden" name="label" value="Request withdrawn." /><button className="btn-outline min-h-10 px-4 text-sm">Withdraw</button></form>
              </Person>
            ))}
          </ul>
        </section>
      )}
      {blocked.length > 0 && (
        <section className="card p-5">
          <h2 className="font-bold">Blocked</h2>
          <ul className="divide-y divide-line">
            {blocked.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                <span className="font-semibold">{b.name}</span>
                <form action={unblockAction}><input type="hidden" name="userId" value={b.id} /><button className="btn-outline min-h-10 px-4 text-sm">Unblock</button></form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
