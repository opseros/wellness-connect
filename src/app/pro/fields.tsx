// Form pieces shared by the professional workspace.

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

export function Check({ name, value, label, defaultChecked }: { name: string; value: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#c9d1cc] bg-white px-3.5 text-[15px] has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="size-4 accent-[#0f6b5c]" />
      {label}
    </label>
  );
}
