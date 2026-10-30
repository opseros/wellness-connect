"use client";
import { useActionState } from "react";
import { createCompanyAction, startProfessionalAction } from "../actions";

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
