import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { makeUser, setFeature } from "@/test/factories";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { decideListing, listPlatformFeatures, setPlatformFeature, staffSeesHospitals, type StaffActor } from "@/modules/admin/service";
import { createCareRequest, listMyCareRequests } from "@/modules/care/service";
import { hospitalsVisible } from "@/modules/platform/features";
import {
  addPhoto,
  createListingOrg,
  directoryCounts,
  getListingWorkspace,
  getPublicListing,
  listDirectory,
  listingsForUser,
  submitListing,
  updateListing,
  uploadDocument,
} from "./service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let db: DB;
let owner: { id: string; email: string; emailVerified: boolean };
let desk: { id: string; email: string; emailVerified: boolean };
let member: { id: string };
let ops: StaffActor, boss: StaffActor;
let gymId: string, gymSlug: string;

const pdf = () => new File([new Uint8Array([37, 80, 68, 70, 45])], "doc.pdf", { type: "application/pdf" });
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" });

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  owner = await makeUser(db, "owner@lotusfit.test", "Lotus Owner");
  desk = await makeUser(db, "desk@cityhospital.test", "City Desk");
  member = await makeUser(db);
  const o = await makeUser(db, "ops@opseros.com");
  ops = { id: o.id, platformRole: "ops", twoFactorEnabled: true };
  const b = await makeUser(db, "boss@opseros.com");
  await db.update(user).set({ platformRole: "super_admin", twoFactorEnabled: true }).where(eq(user.id, b.id));
  boss = { id: b.id, platformRole: "super_admin", twoFactorEnabled: true };
});
afterAll(() => t.close());

describe("hospitals switch", () => {
  it("starts off: nobody but super admins sees hospitals", async () => {
    expect((await listPlatformFeatures(ops)).find((f) => f.key === "hospitals")?.enabled).toBe(false);
    expect(await hospitalsVisible(null)).toBe(false);
    expect(await hospitalsVisible(member.id)).toBe(false);
    expect(await hospitalsVisible(boss.id)).toBe(true);
    expect(await staffSeesHospitals(ops)).toBe(false);
    expect(await staffSeesHospitals(boss)).toBe(true);
  });

  it("blocks hospital sign-up, directory, workspaces and patient requests while off", async () => {
    await expect(createListingOrg(desk, { kind: "hospital", name: "City Hospital", city: "Pune" })).rejects.toMatchObject({ status: 404 });
    // A super admin can set one up to check it before switching on.
    const h = await createListingOrg({ id: boss.id, email: "boss@opseros.com", emailVerified: true }, { kind: "hospital", name: "City Hospital", city: "Pune" });
    expect((await getListingWorkspace(boss.id, h.id)).listing.kind).toBe("hospital");
    expect(await listDirectory("hospital", {}, member.id)).toEqual([]);
    await expect(getPublicListing(member.id, "hospital", h.slug)).rejects.toMatchObject({ status: 404 });
    expect((await directoryCounts()).hospitals).toBe(0);
    await expect(listMyCareRequests(member.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      createCareRequest(member.id, { treatment: "Knee replacement", ageRange: "50-59", travellingFrom: "Nairobi", hospitalIds: [h.id] }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("hospital teams lose their workspace while off and get it back when switched on", async () => {
    await setPlatformFeature(boss, { key: "hospitals", enabled: true });
    const h = await createListingOrg(desk, { kind: "hospital", name: "Desk Hospital", city: "Pune" });
    expect(await listingsForUser(desk.id)).toHaveLength(1);
    await setPlatformFeature(boss, { key: "hospitals", enabled: false });
    await expect(getListingWorkspace(desk.id, h.id)).rejects.toMatchObject({ status: 404 });
    expect(await listingsForUser(desk.id)).toHaveLength(0);
    await setPlatformFeature(boss, { key: "hospitals", enabled: true });
    expect((await getListingWorkspace(desk.id, h.id)).org.name).toBe("Desk Hospital");
    await setPlatformFeature(boss, { key: "hospitals", enabled: false });
  });

  it("only super admins flip it", async () => {
    await expect(setPlatformFeature(ops, { key: "hospitals", enabled: true })).rejects.toMatchObject({ status: 403 });
    await expect(setPlatformFeature(boss, { key: "nope" as "hospitals", enabled: true })).rejects.toThrow();
  });
});

describe("gyms, studios and wellness centres", () => {
  it("lists, verifies and appears in its own directory", async () => {
    const org = await createListingOrg(owner, { kind: "facility", name: "Lotus Yoga and Fitness", city: "Bengaluru" });
    gymId = org.id;
    gymSlug = org.slug;
    let w = await getListingWorkspace(owner.id, gymId);
    expect(w.checklist.map((c) => c.key)).toEqual(["registration", "owner_id", "certifications"]);
    expect(w.readiness.find((r) => r.key === "photos")?.label).toBe("At least 2 photos");

    await updateListing(owner.id, gymId, {
      name: "Lotus Yoga and Fitness",
      city: "Bengaluru",
      about: "Strength floor, two yoga studios and pilates reformers, five minutes from the metro.",
      facilityTypes: ["gym", "yoga", "pilates"],
      amenities: ["women_only", "showers_lockers"],
      openingHours: "Mon to Sat 6 am to 10 pm",
      membershipFromRupees: 1800,
      dropInRupees: 400,
      freeTrial: true,
      corporatePlans: true,
      // Homestay and hospital fields are ignored for a facility.
      rooms: 4,
      specialties: ["Cardiology"],
    });
    await addPhoto(owner.id, gymId, png(), "Studio");
    await addPhoto(owner.id, gymId, png(), "Gym floor");
    await uploadDocument(owner.id, gymId, { docType: "registration" }, pdf());
    await uploadDocument(owner.id, gymId, { docType: "owner_id" }, pdf());
    w = await getListingWorkspace(owner.id, gymId);
    expect(w.listing).toMatchObject({ membershipFromPaise: 180000, dropInPaise: 40000, rooms: null, specialties: [], freeTrial: true });
    expect(w.canSubmit).toBe(true);
    await submitListing(owner.id, gymId);
    await decideListing(ops, gymId, { decision: "approved", checked: ["details", "photos", "registration", "owner_id"] });

    expect((await listDirectory("facility")).map((r) => r.name)).toEqual(["Lotus Yoga and Fitness"]);
    expect((await listDirectory("facility", { type: "yoga", amenity: "women_only" })).length).toBe(1);
    expect(await listDirectory("facility", { type: "swimming" })).toEqual([]);
    expect(await listDirectory("homestay")).toEqual([]);
    const page = await getPublicListing(null, "facility", gymSlug);
    expect(page.listing).not.toHaveProperty("contactEmail");
    expect((await directoryCounts()).facilities).toBe(1);
  });

  it("isn't affected by the hospitals switch", async () => {
    expect(await hospitalsVisible(member.id)).toBe(false);
    expect((await listingsForUser(owner.id)).map((l) => l.kind)).toEqual(["facility"]);
    expect((await getListingWorkspace(owner.id, gymId)).listing.status).toBe("verified");
  });
});
