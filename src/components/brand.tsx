import { BrandLockup } from "./brand-mark";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} aria-label={`${BRAND.name}, ${BRAND.tagline}`} className="flex items-center">
      <BrandLockup size="sm" light={light} name={BRAND.name} tag={BRAND.tagline} />
    </Link>
  );
}

export { AppHeader } from "./app-header";
