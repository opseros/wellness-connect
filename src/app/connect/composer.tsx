"use client";
import { useState } from "react";
import { meetupAction, postAction } from "./actions";

/** Write a post or plan a meet-up, optionally inside a group. */
export function Composer({ back, groupId, city, placeholder = "Share an idea, a tip or a question with your network" }: { back: string; groupId?: string; city?: string; placeholder?: string }) {
  const [mode, setMode] = useState<"post" | "meetup">("post");
  const tab = (m: "post" | "meetup", label: string) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-full px-3.5 py-2 text-sm font-semibold ${mode === m ? "bg-ink text-white" : "text-[#3d4842] hover:bg-ground"}`}>
      {label}
    </button>
  );
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div role="tablist" aria-label="What to share" className="flex gap-1">
        {tab("post", "Post")}
        {tab("meetup", "Meet-up")}
      </div>
      {mode === "post" ? (
        <form action={postAction} className="flex flex-col gap-3">
          <input type="hidden" name="back" value={back} />
          {groupId && <input type="hidden" name="groupId" value={groupId} />}
          <label htmlFor="body" className="sr-only">Your post</label>
          <textarea id="body" name="body" rows={2} maxLength={3000} required className="input py-3" placeholder={placeholder} />
          <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
            <span>Please don&apos;t share health details about yourself or others.</span>
            <button className="btn-primary">Post</button>
          </div>
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
          <div className="col-span-full flex justify-end">
            <button className="btn-primary">Post meet-up</button>
          </div>
        </form>
      )}
    </div>
  );
}
