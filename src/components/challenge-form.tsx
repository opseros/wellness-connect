// The "new challenge" form, used by company workspaces and the admin portal.
import { CHALLENGE_UNITS } from "@/db/schema";

const UNIT_OPTION: Record<(typeof CHALLENGE_UNITS)[number], string> = {
  steps: "Steps (total over the challenge)",
  minutes: "Minutes of activity",
  km: "Kilometres (walk, run, cycle)",
  days: "Days done (a habit, once a day)",
};

export function ChallengeForm({ action, hidden = {}, today, button = "Start challenge" }: { action: (f: FormData) => Promise<void>; hidden?: Record<string, string>; today: string; button?: string }) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">
        Title
        <input name="title" required minLength={3} maxLength={80} className="input" placeholder="10,000 steps a day this week" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">
        <span>What it&apos;s about <span className="font-normal text-muted">(optional)</span></span>
        <textarea name="about" maxLength={600} rows={2} className="input min-h-20 py-2.5" placeholder="Take the stairs, walk your calls, park further away. Log your steps each evening." />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Measured in
        <select name="unit" className="input" defaultValue="steps">
          {CHALLENGE_UNITS.map((u) => <option key={u} value={u}>{UNIT_OPTION[u]}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Goal for each person
        <input name="goal" type="number" required min={1} className="input" placeholder="70000" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Starts
        <input name="startsOn" type="date" required min={today} defaultValue={today} className="input" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Ends
        <input name="endsOn" type="date" required min={today} className="input" />
      </label>
      <p className="text-[13px] text-muted sm:col-span-2">Up to 6 weeks. People only ever see their own numbers; everyone sees the group total once 3 people have joined. No health details are collected.</p>
      <button className="btn-primary justify-self-start">{button}</button>
    </form>
  );
}
