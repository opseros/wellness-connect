import { SPACE_TINT } from "@/components/landing";

const AVATAR_TONES = Object.values(SPACE_TINT);
/** Same person, same colour: a stable tint from their name. */
const toneFor = (name: string) => AVATAR_TONES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_TONES.length];

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-bold ${toneFor(name)}`} style={{ width: size, height: size, fontSize: size / 2.8 }}>
      {initials}
    </span>
  );
}
