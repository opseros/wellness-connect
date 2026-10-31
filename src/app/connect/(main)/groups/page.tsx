import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/session";
import { listGroups } from "@/modules/connect/service";
import { SpaceIcon } from "@/components/landing";
import { createGroupAction, joinGroupAction } from "../../actions";
import { Flash } from "../../ui";

export const metadata: Metadata = { title: "Groups & spaces" };

const tint: Record<string, string> = {
  wellness: "bg-wellness text-wellness-ink",
  travel: "bg-travel text-travel-ink",
  meetup: "bg-meetup text-meetup-ink",
  move: "bg-move text-move-ink",
  food: "bg-food text-food-ink",
  career: "bg-career text-career-ink",
};

export default async function Groups({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [rows, sp] = await Promise.all([listGroups(me.id), searchParams]);
  const spaces = rows.filter((r) => r.group.kind === "space");
  const communities = rows.filter((r) => r.group.kind === "community");
  const join = (r: (typeof rows)[number]) =>
    r.myStatus === "active" ? (
      <span className="text-[13px] font-semibold">Joined</span>
    ) : r.myStatus === "pending" ? (
      <span className="text-[13px] font-semibold">Requested</span>
    ) : (
      <form action={joinGroupAction}>
        <input type="hidden" name="groupId" value={r.group.id} />
        <input type="hidden" name="approval" value={r.group.privacy === "approval" ? "1" : "0"} />
        <input type="hidden" name="back" value="/connect/groups" />
        <button className="btn min-h-9 bg-white px-4 text-sm text-ink">{r.group.privacy === "approval" ? "Ask to join" : "Join"}</button>
      </form>
    );
  return (
    <>
      <h1 className="text-[26px] font-bold">Groups &amp; spaces</h1>
      <Flash msg={sp.msg} error={sp.error} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Spaces</h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {spaces.map((r) => (
            <li key={r.group.id} className={`flex flex-col gap-3 rounded-[22px] p-5 ${tint[r.group.spaceKey ?? "wellness"]}`}>
              <span className="grid size-10 place-items-center rounded-xl bg-white/70"><SpaceIcon k={r.group.spaceKey ?? "wellness"} className="size-5" /></span>
              <Link href={`/connect/groups/${r.group.slug}`} className="font-display text-[20px] font-bold hover:underline">{r.group.name}</Link>
              <p className="text-sm leading-relaxed opacity-90">{r.group.about}</p>
              <div className="mt-auto flex items-center justify-between gap-2">
                <span className="text-[13px]">{r.members} member{r.members === 1 ? "" : "s"}</span>
                {join(r)}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Communities</h2>
        {communities.length === 0 && <p className="card p-5 text-sm text-muted">No communities yet. Start the first one below.</p>}
        <ul className="flex flex-col gap-2">
          {communities.map((r) => (
            <li key={r.group.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-col">
                <Link href={`/connect/groups/${r.group.slug}`} className="font-semibold text-brand hover:underline">{r.group.name}</Link>
                <span className="text-[13px] text-muted">{[r.group.city, `${r.members} member${r.members === 1 ? "" : "s"}`, r.group.privacy === "approval" ? "Moderators approve new members" : "Open to all"].filter(Boolean).join(" · ")}</span>
              </div>
              <div className="rounded-full bg-ground px-1">{join(r)}</div>
            </li>
          ))}
        </ul>
      </section>
      <details className="card p-5">
        <summary className="cursor-pointer font-bold">Start a community</summary>
        <form action={createGroupAction} className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Name<input name="name" required minLength={3} maxLength={80} className="input" placeholder="Pune run club" /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">City (optional)<input name="city" maxLength={80} className="input" /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Who can join
            <select name="privacy" className="input"><option value="public">Anyone</option><option value="approval">People you approve</option></select>
          </label>
          <label className="col-span-full flex flex-col gap-1.5 text-sm font-semibold">About<textarea name="about" rows={2} maxLength={600} className="input py-2.5" /></label>
          <div className="col-span-full"><button className="btn-primary">Create community</button></div>
        </form>
      </details>
    </>
  );
}
