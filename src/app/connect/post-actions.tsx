"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCommentInline, toggleLikeInline, toggleRsvpInline } from "./actions";

const bar = "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors";

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </svg>
  );
}

/** Like that responds instantly; the server catches up in the background. */
export function LikeButton({ postId, liked, count }: { postId: string; liked: boolean; count: number }) {
  const [state, flip] = useOptimistic({ liked, count }, (s) => ({ liked: !s.liked, count: s.count + (s.liked ? -1 : 1) }));
  const [, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={state.liked}
      aria-label={`${state.liked ? "Unlike" : "Like"} (${state.count})`}
      onClick={() => start(async () => { flip(null); await toggleLikeInline(postId); })}
      className={`${bar} ${state.liked ? "text-[#c2410c] hover:bg-[#fff1ea]" : "text-[#3d4842] hover:bg-ground"}`}
    >
      <Heart filled={state.liked} />
      {state.liked ? "Liked" : "Like"}
      {state.count > 0 && <span className="tabular-nums text-muted">{state.count}</span>}
    </button>
  );
}

export function GoingButton({ postId, going, count, past }: { postId: string; going: boolean; count: number; past: boolean }) {
  const [state, flip] = useOptimistic({ going, count }, (s) => ({ going: !s.going, count: s.count + (s.going ? -1 : 1) }));
  const [, start] = useTransition();
  return (
    <button
      type="button"
      disabled={past}
      aria-pressed={state.going}
      onClick={() => start(async () => { flip(null); await toggleRsvpInline(postId); })}
      className={`${bar} disabled:opacity-60 ${state.going ? "bg-brand text-white hover:bg-brand-dark" : "text-[#3d4842] hover:bg-ground"}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {state.going ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M4 7h16M4 7v12h16V7M8 3v4m8-4v4" />}
      </svg>
      {past ? "Happened" : state.going ? "Going" : "I'm going"}
      <span className={`tabular-nums ${state.going ? "text-white/80" : "text-muted"}`}>{state.count}</span>
    </button>
  );
}

/** Focuses this post's comment box. */
export function CommentButton({ postId, count = 0 }: { postId: string; count?: number }) {
  return (
    <button type="button" onClick={() => document.getElementById(`c-${postId}`)?.focus()} className={`${bar} text-[#3d4842] hover:bg-ground`}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round">
        <path d="M5 18.5V6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 2.5Z" />
      </svg>
      Comment
      {count > 0 && <span className="tabular-nums text-muted">{count}</span>}
    </button>
  );
}

export function CopyLinkButton({ postId }: { postId: string }) {
  const [done, setDone] = useState(false);
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${location.origin}/connect/posts/${postId}`);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          router.push(`/connect/posts/${postId}`);
        }
      }}
      className={`${bar} ml-auto text-[#3d4842] hover:bg-ground`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </svg>
      <span aria-live="polite">{done ? "Link copied" : "Copy link"}</span>
    </button>
  );
}

/** Adds a comment without reloading the page; clears the box when it's saved. */
export function CommentBox({ postId }: { postId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const body = String(new FormData(e.currentTarget).get("body") ?? "").trim();
        if (!body) return;
        start(async () => {
          const r = await addCommentInline(postId, body);
          setError(r.error ?? null);
          if (!r.error) ref.current?.reset();
        });
      }}
      className="flex flex-col gap-1.5"
    >
      <div className="flex gap-2">
        <label htmlFor={`c-${postId}`} className="sr-only">Write a comment</label>
        <input id={`c-${postId}`} name="body" required maxLength={1500} placeholder="Write a comment…" className="input min-h-10 rounded-full px-4" />
        <button disabled={pending} className="btn-outline min-h-10 rounded-full px-4 text-sm">{pending ? "Sending…" : "Reply"}</button>
      </div>
      {error && <p role="alert" className="text-[13px] text-[#9b2c1f]">{error}</p>}
    </form>
  );
}

/** Long posts start folded at about six lines. */
export function ExpandableText({ text }: { text: string }) {
  const long = text.length > 420 || text.split("\n").length > 6;
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-1">
      <p className={`whitespace-pre-line text-[15.5px] leading-relaxed ${long && !open ? "line-clamp-6" : ""}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} className="text-sm font-semibold text-brand hover:underline">
          {open ? "Show less" : "See more"}
        </button>
      )}
    </div>
  );
}
