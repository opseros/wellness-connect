// Pieces shared by the Connect pages.
export { Avatar } from "./avatar";
import Link from "next/link";
import { SPACE_TINT, SpaceIcon, type SpaceKey } from "@/components/landing";
import { deleteCommentAction, deletePostAction, reportAction } from "./actions";
import { Avatar } from "./avatar";
import { CommentBox, CommentButton, CopyLinkButton, ExpandableText, GoingButton, LikeButton } from "./post-actions";

const tz = { timeZone: "Asia/Kolkata" } as const;
export const when = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", ...tz }).format(typeof d === "string" ? new Date(d) : d) : "";
const dayParts = (d: Date) => ({
  wd: new Intl.DateTimeFormat("en-IN", { weekday: "short", ...tz }).format(d),
  day: new Intl.DateTimeFormat("en-IN", { day: "numeric", ...tz }).format(d),
  mon: new Intl.DateTimeFormat("en-IN", { month: "short", ...tz }).format(d),
  time: new Intl.DateTimeFormat("en-IN", { timeStyle: "short", ...tz }).format(d),
});

export type FeedPost = {
  id: string;
  kind: "post" | "meetup";
  body: string;
  title: string | null;
  groupName: string | null;
  groupSlug: string | null;
  spaceKey?: string | null;
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

/** "now", "5m", "3h", "2d", then a date. */
function ago(d: Date | string) {
  const t = new Date(d);
  const s = Math.max(0, (Date.now() - t.getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...tz }).format(t);
}

function GroupChip({ p }: { p: FeedPost }) {
  if (!p.groupSlug) return null;
  const key = p.spaceKey as SpaceKey | null | undefined;
  return (
    <Link href={`/connect/groups/${p.groupSlug}`} className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-0.5 text-[12px] font-semibold hover:opacity-85 ${key ? SPACE_TINT[key] : "bg-ground text-[#3d4842]"}`}>
      {key && <SpaceIcon k={key} className="size-3.5 shrink-0" />}
      <span className="truncate">{p.groupName}</span>
    </Link>
  );
}

export function PostCard({ p, me, back, comments = [], canComment = true, full = false }: { p: FeedPost; me: string; back: string; comments?: Comment[]; canComment?: boolean; full?: boolean }) {
  const hidden = (
    <>
      <input type="hidden" name="postId" value={p.id} />
      <input type="hidden" name="back" value={full ? "/connect" : back} />
    </>
  );
  const ev = p.eventAt ? dayParts(new Date(p.eventAt)) : null;
  const past = p.eventAt ? isPast(p.eventAt) : false;
  const hiddenComments = p.comments - comments.length;
  return (
    <article id={`p-${p.id}`} className="card flex scroll-mt-24 flex-col gap-3.5 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/connect/members/${p.authorId}`} tabIndex={-1}><Avatar name={p.authorName} size={44} /></Link>
          <span className="flex min-w-0 flex-col gap-0.5">
            <Link href={`/connect/members/${p.authorId}`} className="truncate font-bold hover:underline">{p.authorName}</Link>
            <span className="truncate text-[13px] text-muted">{p.authorHeadline || "Member"}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
              <Link href={`/connect/posts/${p.id}`} className="hover:underline" title={when(p.createdAt)}>
                <time dateTime={new Date(p.createdAt).toISOString()}>{ago(p.createdAt)}</time>
              </Link>
              <GroupChip p={p} />
            </span>
          </span>
        </div>
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
          <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-white py-1.5 leading-tight shadow-sm">
            <span className="text-[11px] font-semibold uppercase">{ev.wd}</span>
            <span className="font-display text-[24px] font-extrabold">{ev.day}</span>
            <span className="text-[11px] font-semibold uppercase">{ev.mon}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-display text-[19px] font-bold leading-tight">{p.title}</span>
            <span className="text-sm font-medium">{ev.time} · {p.eventPlace}, {p.eventCity}</span>
            <span className="text-[13px]">{p.going} going{past ? " · this has happened" : ""}</span>
            {p.body && p.body !== p.title && <span className="mt-1 whitespace-pre-line text-sm text-ink">{p.body}</span>}
          </div>
        </div>
      ) : (
        <ExpandableText text={p.body} />
      )}

      <div className="-mx-1 flex flex-wrap items-center gap-0.5 border-t border-line pt-2">
        <LikeButton postId={p.id} liked={p.likedByMe} count={p.likes} />
        {canComment && <CommentButton postId={p.id} count={p.comments} />}
        {p.kind === "meetup" && <GoingButton postId={p.id} going={p.goingByMe} count={p.going} past={past} />}
        <CopyLinkButton postId={p.id} />
      </div>

      {!full && hiddenComments > 0 && (
        <Link href={`/connect/posts/${p.id}`} className="text-[13.5px] font-semibold text-muted hover:text-ink hover:underline">
          View {hiddenComments === 1 ? "1 earlier comment" : `${hiddenComments} earlier comments`}
        </Link>
      )}
      {comments.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={c.authorName} size={32} />
              <div className="flex min-w-0 flex-1 flex-col rounded-2xl bg-ground px-3.5 py-2">
                <span className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <Link href={`/connect/members/${c.authorId}`} className="truncate font-semibold hover:underline">{c.authorName}</Link>
                    <time dateTime={new Date(c.createdAt).toISOString()} className="shrink-0 text-[12px] text-muted" title={when(c.createdAt)}>{ago(c.createdAt)}</time>
                  </span>
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
                <span className="whitespace-pre-line text-[14.5px]">{c.body}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canComment && <CommentBox postId={p.id} />}
    </article>
  );
}

export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (error) return <p role="alert" className="rounded-xl bg-[#fbe9e6] px-4 py-3 text-sm text-[#9b2c1f]">{error}</p>;
  if (msg) return <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand-dark">{msg}</p>;
  return null;
}
