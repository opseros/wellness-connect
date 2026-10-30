"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Field } from "@/app/pro/fields";
import { saveRequirementAction } from "../../actions";

type Req = {
  id: string;
  status: string;
  title: string;
  categoryId: string;
  city: string;
  deliveryMode: string;
  participants: number;
  budgetMinPaise: number;
  budgetMaxPaise: number;
  preferredDate: string | null;
  mustBeVerified: boolean;
  mustLanguages: string[];
  minYearsExperience: number;
  details: string;
};

const MODES = [
  { v: "in_person", l: "In person" },
  { v: "virtual", l: "Virtual" },
  { v: "hybrid", l: "Hybrid" },
];

export function RequirementForm({ orgId, categories, defaultCity, req: saved }: { orgId: string; categories: { id: string; name: string }[]; defaultCity: string; req?: Req }) {
  const [state, action, pending] = useActionState(saveRequirementAction, null);
  const published = saved?.status === "published";
  // After a failed save, show what was typed rather than the saved version.
  const v = state?.values;
  const val = (k: string) => (typeof v?.[k] === "string" ? (v[k] as string) : undefined);
  const req = saved;
  const d = {
    title: val("title") ?? req?.title,
    categoryId: val("categoryId") ?? req?.categoryId,
    city: val("city") ?? req?.city ?? defaultCity,
    deliveryMode: val("deliveryMode") ?? req?.deliveryMode ?? "in_person",
    participants: val("participants") ?? req?.participants ?? 30,
    budgetMin: val("budgetMinRupees") ?? (req ? req.budgetMinPaise / 100 : undefined),
    budgetMax: val("budgetMaxRupees") ?? (req ? req.budgetMaxPaise / 100 : undefined),
    preferredDate: val("preferredDate") ?? req?.preferredDate ?? undefined,
    mustBeVerified: v ? v.mustBeVerified === "on" : (req?.mustBeVerified ?? true),
    mustLanguages: val("mustLanguages") ?? req?.mustLanguages.join(", "),
    minYears: val("minYearsExperience") ?? req?.minYearsExperience ?? 0,
    details: val("details") ?? req?.details,
  };
  return (
    <form key={state?.attempt ?? 0} action={action} className="card flex max-w-[820px] flex-col gap-5 p-6">
      {state?.error && (
        <p role="alert" className="rounded-xl bg-[#fbe9e6] px-4 py-3 text-sm text-[#9b2c1f]">{state.error}</p>
      )}
      <input type="hidden" name="orgId" value={orgId} />
      {req && <input type="hidden" name="requirementId" value={req.id} />}
      <Field id="title" label="Title" hint="e.g. “Mindfulness workshop for the Q1 kickoff”.">
        <input id="title" name="title" defaultValue={d.title} required minLength={3} maxLength={160} className="input" />
      </Field>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Field id="categoryId" label="Category">
          <select id="categoryId" name="categoryId" defaultValue={d.categoryId} required className="input">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field id="city" label="City" hint="Needed for in-person and hybrid sessions.">
          <input id="city" name="city" defaultValue={d.city} maxLength={80} className="input" />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1">Delivery mode</legend>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <label key={m.v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#c9d1cc] bg-white px-3.5 text-[15px] has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="deliveryMode" value={m.v} defaultChecked={d.deliveryMode === m.v} className="size-4 accent-[#0f6b5c]" />
              {m.l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        <Field id="participants" label="Participants">
          <input id="participants" name="participants" type="number" min={1} defaultValue={d.participants} required className="input" />
        </Field>
        <Field id="budgetMinRupees" label="Budget from (₹)">
          <input id="budgetMinRupees" name="budgetMinRupees" type="number" min={0} step={1} defaultValue={d.budgetMin} required className="input" />
        </Field>
        <Field id="budgetMaxRupees" label="Budget to (₹)">
          <input id="budgetMaxRupees" name="budgetMaxRupees" type="number" min={0} step={1} defaultValue={d.budgetMax} required className="input" />
        </Field>
        <Field id="preferredDate" label="Preferred date">
          <input id="preferredDate" name="preferredDate" type="date" defaultValue={d.preferredDate} className="input" />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-xl bg-ground p-4">
        <legend className="label px-1">
          Must-haves <span className="font-normal text-muted">(hard filters, never outweighed by score)</span>
        </legend>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="mustBeVerified" defaultChecked={d.mustBeVerified} className="size-4 accent-[#0f6b5c]" />
          Verified credentials only
        </label>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <Field id="mustLanguages" label="Must deliver in" hint="Languages, separated by commas. Leave empty for any.">
            <input id="mustLanguages" name="mustLanguages" defaultValue={d.mustLanguages} className="input" placeholder="English" />
          </Field>
          <Field id="minYearsExperience" label="Minimum years of experience">
            <input id="minYearsExperience" name="minYearsExperience" type="number" min={0} max={50} defaultValue={d.minYears} className="input" />
          </Field>
        </div>
      </fieldset>
      <Field id="details" label="Details" hint="Goals, audience and format. Share team-level needs only, never individual employees' health information.">
        <textarea id="details" name="details" defaultValue={d.details} rows={4} maxLength={4000} className="input py-3" />
      </Field>
      <div className="flex flex-wrap gap-2">
        {!published && <button name="intent" value="draft" className="btn-outline" disabled={pending}>Save draft</button>}
        <button name="intent" value="publish" className="btn-primary" disabled={pending}>{published ? "Save and update matches" : "Publish and find professionals →"}</button>
        <Link href={req ? `/company/${orgId}/requirements/${req.id}` : `/company/${orgId}/requirements`} className="btn-outline">Cancel</Link>
      </div>
    </form>
  );
}
