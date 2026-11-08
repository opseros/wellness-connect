import { avatarColor, initialsOf } from "@/components/avatar-tone";

/** Initials on a solid colour that stays the same for each person (as in the prototype). */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full font-extrabold text-white" style={{ width: size, height: size, fontSize: Math.max(11, size / 3.1), background: avatarColor(name) }}>
      {initialsOf(name)}
    </span>
  );
}
