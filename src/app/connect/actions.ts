"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { withMessage } from "@/lib/flash";
import { requireUser } from "@/modules/identity/session";
import {
  addComment,
  blockMember,
  createGroup,
  createMeetup,
  createPost,
  createReferral,
  deleteComment,
  deletePost,
  followMember,
  joinGroup,
  leaveGroup,
  moderateMember,
  removeConnection,
  reportContent,
  requestConnection,
  respondToConnection,
  sendMessage,
  toggleLike,
  toggleRsvp,
  unblockMember,
  unfollowMember,
  updateReferral,
} from "@/modules/connect/service";

// Each action re-checks the session; the Connect service checks visibility, blocks and roles.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** Same-site path to come back to (the page the form was on). */
const back = (f: FormData, fallback = "/connect") => {
  const b = str(f, "back");
  return b.startsWith("/") && !b.startsWith("//") && !b.startsWith("/\\") ? b : fallback;
};

async function run(to: string, ok: string | null, fn: () => Promise<unknown>, success?: string) {
  let target: string;
  try {
    await fn();
    revalidatePath("/connect", "layout");
    target = ok ? withMessage(success ?? to, "msg", ok) : (success ?? to);
  } catch (e) {
    const text = e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong. Please try again.";
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    target = withMessage(to, "error", text);
  }
  redirect(target);
}

export async function meetupAction(form: FormData) {
  const me = await requireUser();
  const date = str(form, "date");
  const time = str(form, "time") || "07:00";
  await run(back(form), "Meet-up posted. You're going.", () =>
    createMeetup(me.id, {
      title: str(form, "title"),
      body: str(form, "body"),
      eventAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T${time}:00+05:30` : "",
      place: str(form, "place"),
      city: str(form, "city"),
      groupId: str(form, "groupId") || undefined,
    }),
  );
}

export async function deletePostAction(form: FormData) {
  const me = await requireUser();
  await run(back(form), "Post deleted.", () => deletePost(me.id, str(form, "postId")));
}

export async function deleteCommentAction(form: FormData) {
  const me = await requireUser();
  await run(back(form), null, () => deleteComment(me.id, str(form, "commentId")));
}

export async function reportAction(form: FormData) {
  const me = await requireUser();
  await run(back(form), "Thanks. Our team will review it.", () =>
    reportContent(me.id, { targetType: str(form, "targetType") as "post", targetId: str(form, "targetId"), reason: str(form, "reason") }),
  );
}

export async function connectAction(form: FormData) {
  const me = await requireUser();
  await run(back(form), "Connection request sent.", () => requestConnection(me.id, str(form, "userId")));
}

export async function respondAction(form: FormData) {
  const me = await requireUser();
  const accept = str(form, "accept") === "1";
  await run(back(form), accept ? "Connected." : "Request declined.", () => respondToConnection(me.id, str(form, "connectionId"), accept));
}

export async function removeConnectionAction(form: FormData) {
  const me = await requireUser();
  await run(back(form), str(form, "label") || "Removed.", () => removeConnection(me.id, str(form, "userId")));
}

export async function followAction(form: FormData) {
  const me = await requireUser();
  const on = str(form, "follow") === "1";
  await run(back(form), on ? "Following. Their posts will show in your feed." : "Unfollowed.", () => (on ? followMember(me.id, str(form, "userId")) : unfollowMember(me.id, str(form, "userId"))));
}

export async function blockAction(form: FormData) {
  const me = await requireUser();
  await run("/connect/network", "Blocked. They can't see you or message you.", () => blockMember(me.id, str(form, "userId")), "/connect/network");
}

export async function unblockAction(form: FormData) {
  const me = await requireUser();
  await run("/connect/network", "Unblocked.", () => unblockMember(me.id, str(form, "userId")));
}

export async function messageAction(form: FormData) {
  const me = await requireUser();
  const to = str(form, "toUserId");
  let target: string;
  try {
    const m = await sendMessage(me.id, { toUserId: to, body: str(form, "body") });
    target = `/connect/messages?c=${m.conversationId}`;
  } catch (e) {
    const text = e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Write a message") : "Something went wrong";
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    target = withMessage(back(form, "/connect/messages"), "error", text);
  }
  revalidatePath("/connect", "layout");
  redirect(target);
}

export async function createGroupAction(form: FormData) {
  const me = await requireUser();
  let slug = "";
  try {
    slug = (await createGroup(me.id, { name: str(form, "name"), about: str(form, "about"), privacy: str(form, "privacy") === "approval" ? "approval" : "public", city: str(form, "city") })).slug;
  } catch (e) {
    const text = e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong";
    redirect(withMessage("/connect/groups", "error", text));
  }
  revalidatePath("/connect", "layout");
  redirect(withMessage(`/connect/groups/${slug}`, "msg", "Group created. You're its moderator."));
}

export async function joinGroupAction(form: FormData) {
  const me = await requireUser();
  await run(back(form, "/connect/groups"), str(form, "approval") === "1" ? "Request sent to the moderators." : "Joined.", () => joinGroup(me.id, str(form, "groupId")));
}

export async function leaveGroupAction(form: FormData) {
  const me = await requireUser();
  await run(back(form, "/connect/groups"), "You left the group.", () => leaveGroup(me.id, str(form, "groupId")));
}

export async function moderateAction(form: FormData) {
  const me = await requireUser();
  const action = str(form, "action") as "approve" | "decline" | "remove" | "make_moderator";
  const labels = { approve: "Approved.", decline: "Declined.", remove: "Removed from the group.", make_moderator: "They're now a moderator." };
  await run(back(form), labels[action] ?? "Done.", () => moderateMember(me.id, str(form, "groupId"), str(form, "userId"), { action }));
}

export async function referralAction(form: FormData) {
  const me = await requireUser();
  await run("/connect/referrals", "Referral sent.", () =>
    createReferral(me.id, { toUserId: str(form, "toUserId"), categoryId: str(form, "categoryId") || undefined, clientLabel: str(form, "clientLabel"), note: str(form, "note") }),
  );
}

export async function referralUpdateAction(form: FormData) {
  const me = await requireUser();
  const status = str(form, "status") as "accepted" | "declined" | "completed" | "withdrawn";
  const labels = { accepted: "Accepted. Contact the professional to take it forward.", declined: "Declined.", completed: "Marked as completed.", withdrawn: "Referral withdrawn." };
  await run("/connect/referrals", labels[status] ?? "Updated.", () => updateReferral(me.id, str(form, "referralId"), { status, note: str(form, "note") }));
}

// ---------- In-place actions (no page reload or scroll jump) ----------
// Used by the feed's buttons; they refresh the page data and return an error message if any.

async function inline(fn: () => Promise<unknown>): Promise<{ error?: string }> {
  try {
    await fn();
    revalidatePath("/connect", "layout");
    return {};
  } catch (e) {
    if (!(e instanceof AppError) && !(e instanceof ZodError)) console.error(e);
    return { error: e instanceof AppError ? e.message : e instanceof ZodError ? (e.issues[0]?.message ?? "Check the form") : "Something went wrong. Please try again." };
  }
}

export async function toggleLikeInline(postId: string) {
  const me = await requireUser();
  return inline(() => toggleLike(me.id, postId));
}

export async function toggleRsvpInline(postId: string) {
  const me = await requireUser();
  return inline(() => toggleRsvp(me.id, postId));
}

export async function addCommentInline(postId: string, body: string) {
  const me = await requireUser();
  return inline(() => addComment(me.id, postId, { body }));
}

/** Composer: posts in place so the box can clear itself and show errors next to it. */
export async function postInline(form: FormData) {
  const me = await requireUser();
  return inline(() => createPost(me.id, { body: str(form, "body"), groupId: str(form, "groupId") || undefined }));
}
