"use client";
import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A navigation link that prefetches the whole page as soon as the person shows
 * intent (pointer over it, touch, or keyboard focus). By the click, the page is
 * usually already in the browser, so it opens without a loading screen.
 * Before intent it behaves like a normal Link (prefetches only the light
 * layout part when visible). Full prefetches stay fresh for staleTimes.static.
 */
export function IntentLink(props: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  const on = () => setIntent(true);
  return <Link {...props} prefetch={intent ? true : null} onPointerEnter={on} onTouchStart={on} onFocus={on} />;
}
