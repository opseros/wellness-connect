import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/modules/identity/session";
import { getPost, listComments } from "@/modules/connect/service";
import { Flash, PostCard } from "../../../ui";

export const metadata = { title: "Post" };

/** One post with its whole conversation; the link people share. */
export default async function PostPage({ params, searchParams }: { params: Promise<{ postId: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const me = (await getCurrentUser())!;
  const [{ postId }, sp] = await Promise.all([params, searchParams]);
  const missing = (e: unknown) => {
    if (e instanceof AppError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  };
  const [p, comments] = await Promise.all([getPost(me.id, postId).catch(missing), listComments(me.id, postId).catch(missing)]);
  return (
    <main className="flex max-w-[720px] flex-col gap-4">
      <Link href="/connect" className="text-sm font-semibold text-brand hover:underline">← Feed</Link>
      <h1 className="sr-only">{p.title ?? `Post by ${p.authorName}`}</h1>
      <Flash msg={sp.msg} error={sp.error} />
      <PostCard p={p} me={me.id} back={`/connect/posts/${p.id}`} comments={comments} full />
    </main>
  );
}
