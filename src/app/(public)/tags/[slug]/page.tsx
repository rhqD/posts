import { notFound } from "next/navigation";
import { getPostsByTag, getAllTags } from "@/lib/notion";
import PostCard from "@/components/post/PostCard";
import PageWrapper from "@/components/layout/PageWrapper";
import type { Metadata } from "next";

export const dynamicParams = false;

export async function generateStaticParams() {
  const tags = await getAllTags();
  return tags.map((tag) => ({ slug: tag.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Tag: ${slug}` };
}

export default async function TagPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const posts = await getPostsByTag(slug);

  if (posts.length === 0) notFound();

  return (
    <PageWrapper>
      <h1 className="text-2xl font-bold mb-8">Tag: {slug}</h1>
      {posts.map((post) => <PostCard key={post.id} post={post} />)}
    </PageWrapper>
  );
}
