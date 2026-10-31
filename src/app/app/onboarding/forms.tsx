"use client";
import { useActionState } from "react";
import { createCompanyAction, createListingAction, startProfessionalAction } from "../actions";

export function CompanyForm() {
  const [error, action, pending] = useActionState(createCompanyAction, null);
  return (
    <form action={action} className="mt-auto flex flex-col gap-3">
      <label htmlFor="company-name" className="label">Company name</label>
      <input id="company-name" name="name" required minLength={2} className="input" placeholder="Northwind Labs" />
      {error && <p role="alert" className="text-sm text-[#9b2c1f]">{error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create company"}</button>
    </form>
  );
}

export function ProfessionalForm() {
  const [error, action, pending] = useActionState(startProfessionalAction, null);
  return (
    <form action={action} className="mt-auto flex flex-col gap-3">
      <label htmlFor="headline" className="label">Headline</label>
      <input id="headline" name="headline" required className="input" placeholder="Mindfulness coach" />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="city" className="label">City</label>
          <input id="city" name="city" required className="input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="years" className="label">Years</label>
          <input id="years" name="years" type="number" min={0} max={60} defaultValue={0} className="input" />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-[#9b2c1f]">{error}</p>}
      <button className="btn-outline" disabled={pending}>{pending ? "Saving…" : "Start my profile"}</button>
    </form>
  );
}

export function ListingForm({ kind }: { kind: "homestay" | "hospital" }) {
  const [error, action, pending] = useActionState(createListingAction, null);
  const homestay = kind === "homestay";
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${kind}-name`} className="label">{homestay ? "Homestay name" : "Hospital name"}</label>
          <input id={`${kind}-name`} name="name" required minLength={2} maxLength={120} className="input" placeholder={homestay ? "Aranya Garden Stay" : "Aranya Multispeciality Hospital"} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${kind}-city`} className="label">City</label>
          <input id={`${kind}-city`} name="city" required minLength={2} maxLength={80} className="input" />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-[#9b2c1f]">{error}</p>}
      <button className="btn-primary self-start" disabled={pending}>{pending ? "Creating…" : homestay ? "List my homestay" : "Register my hospital"}</button>
    </form>
  );
}
