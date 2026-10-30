import type { Metadata } from "next";
import { getOwnCategoryIds, listCategories } from "@/modules/professionals/service";
import { Flash, PageTitle } from "@/components/ui";
import { saveProfileAction, setDiscoverableAction } from "../actions";
import { getProOrExit, MODE_LABEL } from "../me";
import { Check, Field } from "../fields";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfileEditor({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { profile: p } = await getProOrExit();
  const [categories, mine, sp] = await Promise.all([listCategories(), getOwnCategoryIds(p.id), searchParams]);

  return (
    <>
      <PageTitle title="Your profile" subtitle="This is what companies see when they match with you." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <form action={saveProfileAction} className="card flex min-w-0 flex-[999_1_560px] flex-col gap-5 p-6">
          <Field id="headline" label="Headline" hint="One line, e.g. “Certified yoga and mindfulness coach”.">
            <input id="headline" name="headline" defaultValue={p.headline} required maxLength={160} className="input" />
          </Field>
          <Field id="bio" label="About you" hint="At least 50 characters. Describe your approach and the teams you work with. Don't include client health details.">
            <textarea id="bio" name="bio" defaultValue={p.bio} rows={6} maxLength={3000} className="input py-3" />
          </Field>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <Field id="city" label="City">
              <input id="city" name="city" defaultValue={p.city} required maxLength={80} className="input" />
            </Field>
            <Field id="yearsExperience" label="Years of experience">
              <input id="yearsExperience" name="yearsExperience" type="number" min={0} max={60} defaultValue={p.yearsExperience} className="input" />
            </Field>
          </div>
          <Field id="languages" label="Languages" hint="Separate with commas, e.g. English, Hindi, Kannada.">
            <input id="languages" name="languages" defaultValue={p.languages.join(", ")} className="input" />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="label mb-1">How you deliver</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(MODE_LABEL).map(([v, l]) => (
                <Check key={v} name="deliveryModes" value={v} label={l} defaultChecked={p.deliveryModes.includes(v as never)} />
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="label mb-1">Categories you work in</legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Check key={c.id} name="categoryIds" value={c.id} label={c.name} defaultChecked={mine.includes(c.id)} />
              ))}
            </div>
          </fieldset>
          <div>
            <button className="btn-primary">Save profile</button>
          </div>
        </form>

        <aside className="flex flex-[1_1_280px] flex-col gap-4">
          <form id="visibility" action={setDiscoverableAction} className="card flex flex-col gap-3 p-5">
            <h2 className="font-bold">Visibility</h2>
            <p className="text-sm text-muted">
              {p.discoverable
                ? "You appear in company matches once verified. Hide your profile if you're fully booked."
                : "Hidden: companies can't find you or send new enquiries."}
            </p>
            <input type="hidden" name="discoverable" value={p.discoverable ? "0" : "1"} />
            <button className="btn-outline">{p.discoverable ? "Hide from search" : "Show in search"}</button>
          </form>
          <div className="card flex flex-col gap-2 p-5 text-sm text-muted">
            <h2 className="font-bold text-ink">Tips</h2>
            <p>Profiles with a clear headline, a specific bio and at least one priced service get more enquiries.</p>
            <p>Your verification status is separate from your profile: editing your profile never removes verification.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
