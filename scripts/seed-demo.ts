/**
 * Demo data so a fresh database looks like the Wellness Connect prototype.
 *
 *   DEMO_PASSWORD='choose-a-password' npm run db:seed-demo
 *
 * Creates sign-in-ready accounts (all @demo.moosam.test, emails verified):
 *   ananya  member at Northwind Tech: credits, a booked session, a gym plan, a challenge
 *   rohit   Northwind's wellness manager: credits policy (paid), a team retreat request
 *   kabir   verified yoga coach with member prices and open hours
 *   pulse   Pulse Fitness (gym, benefit partner) with plans
 *   misty   Misty Ridge Stays (homestay) with a retreat request waiting
 *   rohan   independent member
 * plus a Bengaluru circle with posts, a meet-up and a platform-wide challenge.
 *
 * Goes through the real services, so every business rule applies. Refuses to run
 * in production or twice. Outbox emails it creates are discarded (demo addresses).
 * Run with: tsx --conditions=react-server (so "server-only" imports resolve).
 */
import { and, eq, gte } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { getDb, withScope } from "@/db/client";
import { account, category, listing, membership, organization, outbox, professionalCategory, professionalProfile, service, user } from "@/db/schema";
import { saveProfileAndCircles, myCircles, syncCircles } from "@/modules/connect/social";
import { createMeetup, createPost } from "@/modules/connect/service";
import { createPlatformChallenge, istToday, joinChallenge, logProgress } from "@/modules/connect/challenges";
import { createListingOrg } from "@/modules/listings/service";
import { addPlan, setBenefitPartner } from "@/modules/listings/plans";
import { buyPlanWithCredits, companyCredits, paySessionWithCredits, recordFundingPayment, savePolicy } from "@/modules/marketplace/credits";
import { istDay, requestSession, respondToSession, saveBookingSettings, setWeeklyHours } from "@/modules/sessions/service";
import { requestStay } from "@/modules/stays/service";

const DOMAIN = "demo.moosam.test";
const DAY = 86_400_000;
const day = (n: number) => istDay(new Date(Date.now() + n * DAY));
const at = (d: string, hhmm: string) => new Date(`${d}T${hhmm}:00+05:30`).toISOString();
const key = (s: string) => `demo-${s}-${Date.now()}`;

async function main() {
  if (process.env.VERCEL_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  const password = process.env.DEMO_PASSWORD ?? "";
  if (password.length < 10) throw new Error("Set DEMO_PASSWORD (10+ characters) for the demo accounts.");
  const db = getDb();
  if (await db.query.user.findFirst({ where: eq(user.email, `ananya@${DOMAIN}`) })) {
    console.log("Demo data is already there. Nothing to do.");
    return;
  }
  const started = new Date();
  const hash = await hashPassword(password);

  async function person(handle: string, name: string, extra: Partial<typeof user.$inferInsert> = {}) {
    const [u] = await db.insert(user).values({ name, email: `${handle}@${DOMAIN}`, emailVerified: true, ...extra }).returning();
    await db.insert(account).values({ id: crypto.randomUUID(), userId: u.id, accountId: u.id, providerId: "credential", password: hash });
    return u;
  }

  const ops = await person("ops", "Moosam Ops", { platformRole: "ops" });
  const ananya = await person("ananya", "Ananya Rao");
  const rohit = await person("rohit", "Rohit Malhotra");
  const kabir = await person("kabir", "Kabir Sen");
  const pulse = await person("pulse", "Priya Nair");
  const misty = await person("misty", "Meera Kurian");
  const rohan = await person("rohan", "Rohan Gupta");

  // Company with credits: allowance ₹5,000 for sessions and partner gyms, paid for this month.
  const [northwind] = await db.insert(organization).values({ name: "Northwind Tech", slug: "northwind-tech-demo", kind: "company", city: "Bengaluru" }).returning();
  await db.insert(membership).values([
    { orgId: northwind.id, userId: rohit.id, role: "wellness_manager", status: "active" },
    { orgId: northwind.id, userId: ananya.id, role: "member", status: "active" },
  ]);
  await savePolicy(rohit.id, northwind.id, { active: true, allowanceRupees: 5000, coverSessions: true, coverFacilities: true, partnersOnly: true });
  const { current } = await companyCredits(rohit.id, northwind.id);
  await withScope({ bypass: true, userId: null }, (tx) => recordFundingPayment(tx, current!.id, ops.id, { reference: "NEFT-DEMO-0001" }));

  // Connect profiles (joins the Bengaluru circle; company members also get the private Northwind circle).
  const profiles: [string, string, string, string[]][] = [
    [ananya.id, "Product designer", "Bengaluru", ["Walking", "Yoga"]],
    [rohit.id, "People & wellness lead at Northwind", "Bengaluru", ["Wellbeing at work", "Running"]],
    [kabir.id, "Yoga coach · desk-friendly mobility", "Bengaluru", ["Yoga", "Mobility"]],
    [rohan.id, "Independent consultant", "Bangalore", ["Trekking", "Cycling"]],
    [pulse.id, "Runs Pulse Fitness", "Bengaluru", ["Strength"]],
  ];
  for (const [id, headline, city, topics] of profiles) {
    await saveProfileAndCircles(id, { headline, city, topics });
    await syncCircles(id);
  }
  const cityCircle = (await myCircles(ananya.id)).find((c) => !c.company)!;
  const companyCircle = (await myCircles(ananya.id)).find((c) => c.company);
  await createPost(rohan.id, { groupId: cityCircle.id, body: "Anyone up for Nandi Hills this Sunday? Leaving 5 am, back by lunch." });
  await createPost(kabir.id, { groupId: cityCircle.id, body: "Ten minutes of desk mobility between calls does more than an hour on Sunday. Try: neck circles, seated twists, wrist rolls." });
  if (companyCircle) await createPost(rohit.id, { groupId: companyCircle.id, body: "This month's wellness credits are live: ₹5,000 each for sessions and partner gyms. Check Benefits." });
  await createMeetup(ananya.id, { groupId: cityCircle.id, title: "Sunrise walk at Cubbon Park", body: "Easy pace, chai after.", eventAt: at(day(3), "06:30"), place: "Cubbon Park, main gate", city: "Bengaluru" });

  // Platform-wide challenge with three people (so the group total shows).
  const today = istToday();
  const ch = await createPlatformChallenge(ops.id, { title: "10,000 steps a day this week", about: "Walk more, together.", unit: "steps", goal: 70000, dailyMax: 40000, startsOn: day(-1), endsOn: day(5) });
  for (const [u, n] of [[ananya, 8200], [rohit, 11000], [rohan, 6400]] as const) {
    await joinChallenge(u.id, ch.id);
    await logProgress(u.id, ch.id, { day: today, amount: n });
  }

  // Verified yoga coach with a member price and open hours.
  const yoga = await db.query.category.findFirst({ where: eq(category.slug, "yoga-mindfulness") });
  const [profile] = await db
    .insert(professionalProfile)
    .values({ userId: kabir.id, headline: "Yoga coach · desk-friendly mobility", city: "Bengaluru", yearsExperience: 9, languages: ["English", "Hindi"], deliveryModes: ["in_person", "virtual"], verificationStatus: "verified" })
    .returning();
  await db.insert(professionalCategory).values({ profileId: profile.id, categoryId: yoga!.id });
  const [oneToOne] = await db
    .insert(service)
    .values({ profileId: profile.id, categoryId: yoga!.id, title: "1:1 yoga", deliveryModes: ["virtual"], durationMinutes: 60, priceMinPaise: 100000, priceMaxPaise: 100000, memberPricePaise: 120000 })
    .returning();
  await saveBookingSettings(kabir.id, { enabled: true, minNoticeHours: 1, maxDaysAhead: 30, bufferMinutes: 0, meetingLink: "https://meet.example.com/kabir" });
  await setWeeklyHours(kabir.id, [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, start: "06:00", end: "21:00" })));
  // Ananya: one session paid with credits (confirmed), and one request Kabir still has to answer.
  const s1 = await requestSession(ananya.id, { serviceId: oneToOne.id, startsAt: at(day(2), "07:30"), mode: "online", idempotencyKey: key("s1") });
  await respondToSession(kabir.id, s1.id, { accept: true });
  await paySessionWithCredits(ananya.id, s1.id, { idempotencyKey: key("pay-s1") });
  await requestSession(rohan.id, { serviceId: oneToOne.id, startsAt: at(day(4), "18:00"), mode: "online", idempotencyKey: key("s2") });

  // Gym: verified benefit partner with plans; Ananya buys a monthly plan with credits.
  const gym = await createListingOrg({ ...pulse, emailVerified: true }, { kind: "facility", name: "Pulse Fitness", city: "Bengaluru" });
  await db.update(listing).set({ status: "verified", verifiedAt: new Date() }).where(eq(listing.orgId, gym.id));
  const monthly = await addPlan(pulse.id, gym.id, { name: "Monthly unlimited", kind: "monthly", priceRupees: 2499, details: "6 am to 10 pm, all classes" });
  await addPlan(pulse.id, gym.id, { name: "Day pass", kind: "day_pass", priceRupees: 399 });
  await setBenefitPartner(pulse.id, gym.id, true);
  await buyPlanWithCredits(ananya.id, monthly.id, { idempotencyKey: key("plan") });

  // Homestay with a team retreat request from Northwind waiting for the host.
  const stayOrg = await createListingOrg({ ...misty, emailVerified: true }, { kind: "homestay", name: "Misty Ridge Stays", city: "Coorg" });
  await db
    .update(listing)
    .set({ status: "verified", verifiedAt: new Date(), rooms: 6, maxGuests: 14, priceFromPaise: 4_000_00, state: "Karnataka", cancellationPolicy: "moderate", minNights: 1 })
    .where(eq(listing.orgId, stayOrg.id));
  await requestStay({ ...rohit, emailVerified: true } as never, stayOrg.id, { checkIn: day(20), checkOut: day(22), rooms: 4, guests: 10, billingName: "Northwind Tech", purpose: "retreat", forCompany: northwind.id });

  // Demo addresses can't receive mail: drop the emails these steps queued.
  await withScope({ bypass: true, userId: null }, (tx) => tx.delete(outbox).where(and(gte(outbox.createdAt, started))));

  console.log(`Demo data ready. Sign in with any of these and DEMO_PASSWORD:
  ananya@${DOMAIN}  member at Northwind (credits, session, gym plan, challenge)
  rohit@${DOMAIN}   Northwind wellness manager (credits policy, team retreat)
  kabir@${DOMAIN}   yoga coach (professional workspace, earnings)
  pulse@${DOMAIN}   Pulse Fitness (plans & passes, members)
  misty@${DOMAIN}   Misty Ridge Stays (retreat request waiting)
  rohan@${DOMAIN}   independent member`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
