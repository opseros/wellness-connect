import Link from "next/link";
import { Check, Field } from "../fields";
import { MODE_LABEL } from "../me";
import { saveServiceAction } from "../actions";

type Svc = {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  deliveryModes: string[];
  durationMinutes: number;
  priceMinPaise: number;
  priceMaxPaise: number;
};

export function ServiceForm({ categories, service }: { categories: { id: string; name: string }[]; service?: Svc }) {
  return (
    <form action={saveServiceAction} className="card flex max-w-[760px] flex-col gap-5 p-6">
      {service && <input type="hidden" name="serviceId" value={service.id} />}
      <Field id="title" label="Service title" hint="e.g. “90-minute mindfulness workshop for teams”.">
        <input id="title" name="title" defaultValue={service?.title} required minLength={3} maxLength={160} className="input" />
      </Field>
      <Field id="categoryId" label="Category">
        <select id="categoryId" name="categoryId" defaultValue={service?.categoryId} required className="input">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>
      <Field id="description" label="What's included" hint="Format, materials, follow-up. Keep it general: no client health details.">
        <textarea id="description" name="description" defaultValue={service?.description} rows={4} maxLength={2000} className="input py-3" />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1">Delivery</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(MODE_LABEL).map(([v, l]) => (
            <Check key={v} name="deliveryModes" value={v} label={l} defaultChecked={service?.deliveryModes.includes(v)} />
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <Field id="durationMinutes" label="Duration (minutes)">
          <input id="durationMinutes" name="durationMinutes" type="number" min={15} step={5} defaultValue={service?.durationMinutes ?? 60} required className="input" />
        </Field>
        <Field id="priceMinRupees" label="Price from (₹)">
          <input id="priceMinRupees" name="priceMinRupees" type="number" min={0} step={1} defaultValue={service ? service.priceMinPaise / 100 : undefined} required className="input" />
        </Field>
        <Field id="priceMaxRupees" label="Price up to (₹)">
          <input id="priceMaxRupees" name="priceMaxRupees" type="number" min={0} step={1} defaultValue={service ? service.priceMaxPaise / 100 : undefined} required className="input" />
        </Field>
      </div>
      <p className="-mt-2 text-[13px] text-muted">Companies see this range when matching. You quote an exact fee in each proposal.</p>
      <div className="flex gap-2">
        <button className="btn-primary">{service ? "Save changes" : "Add service"}</button>
        <Link href="/pro/services" className="btn-outline">Cancel</Link>
      </div>
    </form>
  );
}
