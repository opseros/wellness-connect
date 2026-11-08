/** Prototype avatar colours: solid, white initials, all pass 4.5:1 contrast with white. */
export const AVATAR_COLORS = ["#0f6b5c", "#1d4f7a", "#a63f74", "#7a5200", "#5a4bb0", "#2e6e52", "#9c3d2e", "#35617f"];

/** Same person, same colour. */
export function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}
