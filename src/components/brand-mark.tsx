/**
 * The Seasons mark: four arcs in the space colours (wellness, meet-ups,
 * movement, travel) around a centre dot. `light` is for dark backgrounds.
 */
export function BrandMark({ size = 32, light = false, className = "" }: { size?: number; light?: boolean; className?: string }) {
  const c = light ? ["#3fb39b", "#f2c46d", "#e48bb8", "#7fb2e0", "#ffffff"] : ["#0f6b5c", "#e0a32e", "#b3487f", "#1d4f7a", "#18211d"];
  return (
    <svg aria-hidden viewBox="0 0 64 64" width={size} height={size} className={className}>
      <g fill="none" strokeWidth={size < 24 ? 11 : 9} strokeLinecap="round">
        <path d="M10.34 28.18 A22 22 0 0 1 28.18 10.34" stroke={c[0]} />
        <path d="M35.82 10.34 A22 22 0 0 1 53.66 28.18" stroke={c[1]} />
        <path d="M53.66 35.82 A22 22 0 0 1 35.82 53.66" stroke={c[2]} />
        <path d="M28.18 53.66 A22 22 0 0 1 10.34 35.82" stroke={c[3]} />
      </g>
      {size >= 24 && <circle cx="32" cy="32" r="6.5" fill={c[4]} />}
    </svg>
  );
}
