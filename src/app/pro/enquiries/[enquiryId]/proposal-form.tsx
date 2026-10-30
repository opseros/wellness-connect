import { Field } from "../../fields";

type Defaults = { fee?: number; participants?: number; date?: string; time?: string; inclusions?: string; message?: string; cancellationDays?: number };

/** New proposal or revised proposal: same fields, different action. Times are entered in IST. */
export function ProposalForm({
  title,
  action,
  hidden,
  min,
  budget,
  defaults,
  submit,
}: {
  title: string;
  action: (f: FormData) => Promise<void>;
  hidden: Record<string, string>;
  min: string;
  budget: string;
  defaults: Defaults;
  submit: string;
}) {
  return (
    <form action={action} className="card flex flex-col gap-4 p-6">
      <h2 className="font-bold">{title}</h2>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        <Field id="feeRupees" label="Your fee (₹)" hint={`Their budget: ${budget}`}>
          <input id="feeRupees" name="feeRupees" type="number" min={1} step={1} defaultValue={defaults.fee} required className="input" />
        </Field>
        <Field id="maxParticipants" label="Max participants">
          <input id="maxParticipants" name="maxParticipants" type="number" min={1} defaultValue={defaults.participants} required className="input" />
        </Field>
        <Field id="date" label="Start date">
          <input id="date" name="date" type="date" min={min} defaultValue={defaults.date} required className="input" />
        </Field>
        <Field id="time" label="Start time (IST)">
          <input id="time" name="time" type="time" defaultValue={defaults.time ?? "10:00"} required className="input" />
        </Field>
      </div>
      <Field id="inclusions" label="What's included">
        <textarea id="inclusions" name="inclusions" rows={3} maxLength={2000} defaultValue={defaults.inclusions} className="input py-3" placeholder="Session plan, handouts, follow-up session…" />
      </Field>
      <Field id="message" label="Message to the company">
        <textarea id="message" name="message" rows={3} maxLength={2000} defaultValue={defaults.message} className="input py-3" />
      </Field>
      <Field id="freeCancellationDays" label="Free cancellation up to (days before)">
        <input id="freeCancellationDays" name="freeCancellationDays" type="number" min={0} max={60} defaultValue={defaults.cancellationDays ?? 7} className="input max-w-[160px]" />
      </Field>
      <button className="btn-primary self-start">{submit}</button>
    </form>
  );
}
