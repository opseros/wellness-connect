/**
 * The Two leaves mark: two leaves leaning together from one stem, two people
 * growing together. `light` is for dark backgrounds.
 */
export function BrandMark({ size = 32, light = false, className = "" }: { size?: number; light?: boolean; className?: string }) {
  const [a, b] = light ? ["#3fb39b", "#a8e0d3"] : ["#0f6b5c", "#3fb39b"];
  return (
    <svg aria-hidden viewBox="0 0 64 64" width={size} height={size} className={className}>
      <path d="M31 54 C13 47 8 27 14 9 C29 15 36 34 31 54 Z" fill={a} />
      <path d="M33 54 C51 47 56 27 50 9 C35 15 28 34 33 54 Z" fill={b} fillOpacity={light ? 1 : 0.9} />
    </svg>
  );
}

const SIZES = {
  sm: { mark: 30, name: "text-[23px]", tag: "text-[8.5px] mt-[4px]" },
  md: { mark: 36, name: "text-[27px]", tag: "text-[9.5px] mt-[5px]" },
  lg: { mark: 44, name: "text-[33px]", tag: "text-[11px] mt-[6px]" },
} as const;

/**
 * Logo lockup: Two leaves mark + the name in lowercase (bold display font, set tight)
 * + the tagline in small spaced capitals in brand green. Decorative: the link
 * around it carries the accessible name.
 */
export function BrandLockup({ size = "md", light = false, tagline = true, name, tag }: { size?: keyof typeof SIZES; light?: boolean; tagline?: boolean; name: string; tag: string }) {
  const s = SIZES[size];
  return (
    <span aria-hidden className="flex items-center gap-2.5">
      <BrandMark size={s.mark} light={light} />
      <span className="flex flex-col leading-none">
        <span className={`font-display font-extrabold tracking-[-0.045em] lowercase ${s.name} ${light ? "text-white" : "text-ink"}`}>{name}</span>
        {tagline && <span className={`font-bold tracking-[0.13em] uppercase ${s.tag} ${light ? "text-[#a8e0d3]" : "text-brand"}`}>{tag}</span>}
      </span>
    </span>
  );
}
