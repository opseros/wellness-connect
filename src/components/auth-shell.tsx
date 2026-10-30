import { Logo } from "./brand";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap">
      <section className="flex flex-[1_1_420px] flex-col justify-between gap-10 bg-brand p-10 text-white sm:p-14">
        <Logo light />
        <div className="flex max-w-md flex-col gap-4">
          <h1 className="font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em]">Find your people for walks, retreats and better workdays.</h1>
          <p className="text-[17px] leading-relaxed text-[#ddede9]">
            A free social space for working professionals: wellness, travel, meet-ups, fitness, food and careers, plus verified experts your company can book.
          </p>
        </div>
        <p className="text-sm leading-relaxed text-[#ddede9]">
          Wellness professionals: get verified and win corporate work.
          <br />
          Everyone else: join Connect free to network with professionals.
        </p>
      </section>
      <section className="flex flex-[1_1_420px] items-center justify-center px-6 py-14">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[28px] font-bold">{title}</h2>
            {subtitle && <p className="text-[15px] text-muted">{subtitle}</p>}
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
