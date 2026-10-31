"use client";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { meetupAction, postInline } from "./actions";
import { Avatar } from "./avatar";

type GroupOption = { id: string; name: string; kind: "space" | "community" };

const STARTERS = [
  { label: "Share a small win", text: "Small win this week: " },
  { label: "Ask for a recommendation", text: "Looking for recommendations: " },
  { label: "Start a conversation", text: "Curious how others handle this: " },
];

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="btn-primary min-w-24 rounded-full">{pending ? "Posting…" : children}</button>;
}

/** Write a post or plan a meet-up, to your network or into one of your groups and spaces. */
export function Composer({
  back,
  groupId,
  groups = [],
  city,
  me,
  placeholder = "Share an idea, a tip or a question with your network",
}: {
  back: string;
  groupId?: string;
  groups?: GroupOption[];
  city?: string;
  me?: string;
  placeholder?: string;
}) {
  const [mode, setMode] = useState<"post" | "meetup">("post");
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const expanded = open || text.length > 0;

  const tab = (m: "post" | "meetup", label: string, icon: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => { setMode(m); setOpen(true); }}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold ${mode === m ? "bg-ink text-white" : "text-[#3d4842] hover:bg-ground"}`}
    >
      {icon}
      {label}
    </button>
  );
  const postTo = !groupId && groups.length > 0 && (
    <label className="flex items-center gap-2 text-[13px] font-semibold text-[#3d4842]">
      Post to
      <select name="groupId" defaultValue="" className="input min-h-9 w-auto rounded-full py-1 pr-8 text-[13px]">
        <option value="">My network</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div id="compose" className="card flex scroll-mt-24 flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="What to share" className="flex gap-1">
          {tab("post", "Post", <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></svg>)}
          {tab("meetup", "Meet-up", <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 7h16v13H4zM4 11h16M8 3v4m8-4v4" /></svg>)}
        </div>
      </div>
      {mode === "post" ? (
        <form
          action={async (f) => {
            const r = await postInline(f);
            setError(r.error ?? null);
            if (!r.error) { setText(""); setOpen(false); }
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="back" value={back} />
          {groupId && <input type="hidden" name="groupId" value={groupId} />}
          <div className="flex gap-3">
            {me && <span className="hidden sm:block"><Avatar name={me} size={42} /></span>}
            <label htmlFor="body" className="sr-only">Your post</label>
            <textarea
              id="body"
              ref={area}
              name="body"
              rows={expanded ? 4 : 2}
              maxLength={3000}
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setOpen(true)}
              className="input min-h-0 flex-1 resize-none rounded-2xl py-3 text-[15.5px] transition-[height]"
              placeholder={placeholder}
            />
          </div>
          {error && <p role="alert" className="rounded-xl bg-[#fbe9e6] px-3.5 py-2 text-sm text-[#9b2c1f] sm:ml-[54px]">{error}</p>}
          {!text && (
            <div className="flex flex-wrap gap-2 sm:pl-[54px]">
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => { setText(s.text); setOpen(true); requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(s.text.length, s.text.length); }); }}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-[#3d4842] hover:border-brand hover:text-brand"
                >
                  {s.label}
                </button>
              ))}
              <button type="button" onClick={() => setMode("meetup")} className="rounded-full border border-line bg-meetup px-3 py-1.5 text-[13px] font-semibold text-meetup-ink hover:opacity-85">
                Plan a walk or run
              </button>
            </div>
          )}
          {expanded && (
            <div className="flex flex-wrap items-center justify-between gap-3 sm:pl-[54px]">
              <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {postTo}
                <span className="text-[12.5px] text-muted">No health details about yourself or others, please.</span>
              </span>
              <span className="flex items-center gap-3">
                {text.length > 2500 && <span className="text-[12.5px] tabular-nums text-muted">{3000 - text.length} left</span>}
                <Submit>Post</Submit>
              </span>
            </div>
          )}
        </form>
      ) : (
        <form action={meetupAction} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          <input type="hidden" name="back" value={back} />
          {groupId && <input type="hidden" name="groupId" value={groupId} />}
          <label className="col-span-full flex flex-col gap-1.5 text-sm font-semibold">Title
            <input name="title" required minLength={3} maxLength={160} className="input" placeholder="Sunrise walk and chai" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Date
            <input name="date" type="date" required className="input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Time (IST)
            <input name="time" type="time" defaultValue="07:00" required className="input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Place
            <input name="place" required className="input" placeholder="Cubbon Park, main gate" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">City
            <input name="city" required defaultValue={city} className="input" />
          </label>
          <label className="col-span-full flex flex-col gap-1.5 text-sm font-semibold">Details (optional)
            <textarea name="body" rows={2} maxLength={2000} className="input py-2.5" placeholder="Pace, what to bring, who it's for" />
          </label>
          <div className="col-span-full flex flex-wrap items-center justify-between gap-3">
            {postTo || <span />}
            <Submit>Post meet-up</Submit>
          </div>
        </form>
      )}
    </div>
  );
}
