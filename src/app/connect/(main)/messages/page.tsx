import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { conversationWith, getMemberPage, listConnections, listConversations, openConversation } from "@/modules/connect/service";
import { AppError } from "@/lib/errors";
import { messageAction } from "../../actions";
import { AutoRefresh } from "../../auto-refresh";
import { Avatar, Flash, ReportForm, when } from "../../ui";

export const metadata: Metadata = { title: "Messages" };

export default async function Messages({ searchParams }: { searchParams: Promise<{ c?: string; to?: string; msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const sp = await searchParams;
  let convId = sp.c ?? null;
  let newTo: { id: string; name: string } | null = null;
  if (!convId && sp.to) {
    convId = await conversationWith(me.id, sp.to).catch(() => null);
    if (!convId) {
      const m = await getMemberPage(me.id, sp.to).catch(() => null);
      if (m && m.canMessage) newTo = { id: m.id, name: m.name };
    }
  }
  // Open (and mark read) first so the list's unread counts are current.
  const open = convId ? await openConversation(me.id, convId).catch((e) => (e instanceof AppError ? null : Promise.reject(e))) : null;
  const [list, connections] = await Promise.all([listConversations(me.id), listConnections(me.id)]);
  const other = open?.other ?? newTo;
  const here = convId ? `/connect/messages?c=${convId}` : sp.to ? `/connect/messages?to=${sp.to}` : "/connect/messages";

  return (
    <>
      <AutoRefresh />
      <h1 className="text-[26px] font-bold">Messages</h1>
      <Flash msg={sp.msg} error={sp.error} />
      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Conversations" className="card flex flex-[1_1_260px] flex-col overflow-hidden">
          {list.length === 0 && <p className="p-4 text-sm text-muted">No conversations yet. Message a connection to start one.</p>}
          {list.map((c) => (
            <Link key={c.id} href={`/connect/messages?c=${c.id}`} aria-current={c.id === convId ? "page" : undefined} className={`flex items-center gap-3 border-b border-line px-4 py-3 ${c.id === convId ? "bg-brand-soft" : "hover:bg-ground"}`}>
              <Avatar name={c.otherName} size={38} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate ${c.unread ? "font-bold" : "font-semibold"}`}>{c.otherName}</span>
                  {c.unread > 0 && <span className="rounded-full bg-brand px-2 text-xs font-bold text-white">{c.unread}</span>}
                </span>
                <span className="truncate text-[13px] text-muted">{c.lastBody}</span>
              </span>
            </Link>
          ))}
          {connections.length > 0 && (
            <details className="p-4">
              <summary className="cursor-pointer text-sm font-semibold text-brand">New message</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {connections.map((c) => (
                  <li key={c.id}><Link href={`/connect/messages?to=${c.id}`} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-ground">{c.name}</Link></li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section aria-label="Conversation" className="card flex min-h-[420px] min-w-0 flex-[999_1_420px] flex-col">
          {!other ? (
            <p className="m-auto p-6 text-sm text-muted">{convId || sp.to ? "You can't message this member. You may need to connect first." : "Choose a conversation."}</p>
          ) : (
            <>
              <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                <Link href={`/connect/members/${other.id}`} className="flex items-center gap-3 font-semibold hover:underline">
                  <Avatar name={other.name} size={34} />
                  {other.name}
                </Link>
                {convId && <ReportForm targetType="message" targetId={convId} back={here} />}
              </header>
              <ol className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 py-4" style={{ maxHeight: 520 }}>
                {(open?.messages ?? []).map((m) => (
                  <li key={m.id} className={`flex max-w-[80%] flex-col gap-0.5 rounded-2xl px-3.5 py-2 ${m.senderId === me.id ? "self-end bg-brand text-white" : "self-start bg-ground"}`}>
                    <span className="whitespace-pre-line text-[15px]">{m.body}</span>
                    <span className={`text-[11px] ${m.senderId === me.id ? "text-white/75" : "text-muted"}`}>{when(m.createdAt)}</span>
                  </li>
                ))}
                {!open && <li className="text-sm text-muted">Say hello to {other.name.split(" ")[0]}.</li>}
              </ol>
              {open && !open.canReply ? (
                <p className="border-t border-line px-5 py-3 text-sm text-muted">You can&apos;t reply to this conversation any more.</p>
              ) : (
                <form action={messageAction} className="flex gap-2 border-t border-line p-3">
                  <input type="hidden" name="toUserId" value={other.id} />
                  <input type="hidden" name="back" value={here} />
                  <label htmlFor="msg" className="sr-only">Message</label>
                  <textarea id="msg" name="body" required rows={1} maxLength={4000} className="input min-h-11 py-2.5" placeholder="Write a message" />
                  <button className="btn-primary">Send</button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
