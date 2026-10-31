// Pieces shared by the Connect pages.
import Link from "next/link";
import { commentAction, deleteCommentAction, deletePostAction, likeAction, reportAction, rsvpAction } from "./actions";

const tz = { timeZone: "Asia/Kolkata" } as const;
export const when = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", ...tz }).format(typeof d === "string" ? new Date(d) : d) : "";
const dayParts = (d: Date) => ({
  wd: new Intl.DateTimeFormat("en-IN", { weekday: "short", ...tz }).format(d),
  day: new Intl.DateTimeFormat("en-IN", { day: "numeric", ...tz }).format(d),
  mon: new Intl.DateTimeFormat("en-IN", { month: "short", ...tz }).format(d),
  time: new Intl.DateTimeFormat("en-IN", { timeStyle: "short", ...tz }).format(d),
});

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand-dark" style={{ width: size, height: size, fontSize: size / 2.8 }}>
      {initials}
    </span>
  );
}

export type FeedPost = {
  id: string;
  kind: "post" | "meetup";
  body: string;
  title: string | null;
  groupName: string | null;
  groupSlug: string | null;
  eventAt: Date | null;
  eventPlace: string | null;
  eventCity: string | null;
  createdAt: Date;
  authorId: string;
  authorName: string;
  authorHeadline: string | null;
  likes: number;
  likedByMe: boolean;
  comments: number;
  going: number;
  goingByMe: boolean;
};

type Comment = { id: string; body: string; authorId: string; authorName: string; createdAt: Date };

export function ReportForm({ targetType, targetId, back }: { targetType: string; targetId: string; back: string }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-lg px-2 py-1.5 text-[13px] font-semibold text-muted hover:bg-ground">Report</summary>
      <form action={reportAction} className="absolute right-0 z-10 mt-1 flex w-64 flex-col gap-2 rounded-xl border border-line bg-white p-3 shadow-lg">
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="back" value={back} />
        <label htmlFor={`r-${targetId}`} className="text-[13px] font-semibold">What&apos;s wrong?</label>
        <select id={`r-${targetId}`} name="reason" className="input">
          <option>Spam or advertising</option>
          <option>Harassment or hate</option>
          <option>Shares someone&apos;s health details</option>
          <option>Medical misinformation</option>
          <option>Something else</option>
        </select>
        <button className="btn-outline min-h-9 text-sm">Send report</button>
      </form>
    </details>
  );
}

/** Outside the component so render stays pure for the React compiler. */
function isPast(d: Date | string) {
  return new Date(d).getTime() < Date.now();
}

export function PostCard({ p, me, back, comments = [], canComment = true }: { p: FeedPost; me: string; back: string; comments?: Comment[]; canComment?: boolean }) {
  const hidden = (
    <>
      <input type="hidden" name="postId" value={p.id} />
      <input type="hidden" name="back" value={back} />
    </>
  );
  const ev = p.eventAt ? dayParts(new Date(p.eventAt)) : null;
  const past = p.eventAt ? isPast(p.eventAt) : false;
  return (
    <article className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/connect/members/${p.authorId}`} className="flex min-w-0 items-center gap-3">
          <Avatar name={p.authorName} />
          <span className="flex min-w-0 flex-col">
            <span className="font-bold hover:underline">{p.authorName}</span>
            <span className="truncate text-[13px] text-muted">
              {p.authorHeadline || "Member"} · {when(p.createdAt)}
              {p.groupSlug && (
                <>
                  {" "}· in <span className="font-semibold text-brand">{p.groupName}</span>
                </>
              )}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {p.authorId === me ? (
            <form action={deletePostAction}>
              {hidden}
              <button className="rounded-lg px-2 py-1.5 text-[13px] font-semibold text-muted hover:bg-ground">Delete</button>
            </form>
          ) : (
            <ReportForm targetType="post" targetId={p.id} back={back} />
          )}
        </div>
      </div>

      {p.kind === "meetup" && ev ? (
        <div className="flex gap-4 rounded-2xl bg-meetup p-4 text-meetup-ink">
          <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-white py-1.5 leading-tight">
            <span className="text-[11px] font-semibold">{ev.wd}</span>
            <span className="font-display text-[22px] font-extrabold">{ev.day}</span>
            <span className="text-[11px] font-semibold">{ev.mon}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-display text-[18px] font-bold leading-tight">{p.title}</span>
            <span className="text-sm">{ev.time} · {p.eventPlace}, {p.eventCity}</span>
            {p.body && p.body !== p.title && <span className="whitespace-pre-line text-sm text-ink">{p.body}</span>}
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line text-[15px] leading-relaxed">{p.body}</p>
      )}

      <div className="flex flex-wrap items-center gap-1 border-t border-line pt-2">
        <form action={likeAction}>
          {hidden}
          <button aria-pressed={p.likedByMe} className={`rounded-lg px-3 py-2 text-sm font-semibold ${p.likedByMe ? "bg-brand-soft text-brand-dark" : "text-[#3d4842] hover:bg-ground"}`}>
            {p.likedByMe ? "Liked" : "Like"} · {p.likes}
          </button>
        </form>
        {p.kind === "meetup" && (
          <form action={rsvpAction}>
            {hidden}
            <button disabled={past} aria-pressed={p.goingByMe} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${p.goingByMe ? "bg-brand text-white" : "text-[#3d4842] hover:bg-ground"}`}>
              {past ? "Happened" : p.goingByMe ? "Going" : "I'm going"} · {p.going}
            </button>
          </form>
        )}
        <span className="px-2 text-sm text-muted">{p.comments} comment{p.comments === 1 ? "" : "s"}</span>
      </div>

      {comments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={c.authorName} size={30} />
              <div className="flex min-w-0 flex-1 flex-col rounded-xl bg-ground px-3 py-2">
                <span className="flex items-center justify-between gap-2 text-[13px]">
                  <Link href={`/connect/members/${c.authorId}`} className="font-semibold hover:underline">{c.authorName}</Link>
                  {c.authorId === me ? (
                    <form action={deleteCommentAction}>
                      <input type="hidden" name="commentId" value={c.id} />
                      <input type="hidden" name="back" value={back} />
                      <button className="text-muted hover:underline">Delete</button>
                    </form>
                  ) : (
                    <ReportForm targetType="comment" targetId={c.id} back={back} />
                  )}
                </span>
                <span className="whitespace-pre-line text-sm">{c.body}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <form action={commentAction} className="flex gap-2">
          {hidden}
          <label htmlFor={`c-${p.id}`} className="sr-only">Write a comment</label>
          <input id={`c-${p.id}`} name="body" required maxLength={1500} placeholder="Write a comment" className="input min-h-10" />
          <button className="btn-outline min-h-10 px-4 text-sm">Reply</button>
        </form>
      )}
    </article>
  );
}

export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (error) return <p role="alert" className="rounded-xl bg-[#fbe9e6] px-4 py-3 text-sm text-[#9b2c1f]">{error}</p>;
  if (msg) return <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-dark">{msg}</p>;
  return null;
}
