import { notFound } from "next/navigation";
import { getPostsByCategory } from "@/lib/notion";
import PostCard from "@/components/post/PostCard";
import PageWrapper from "@/components/layout/PageWrapper";
import type { Metadata } from "next";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const posts = await getPostsByCategory(slug);
  const name = posts[0]?.category?.name || slug;
  return { title: `Category: ${name}` };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const posts = await getPostsByCategory(slug);

  if (posts.length === 0) notFound();

  return (
    <PageWrapper>
      <h1 className="text-2xl font-bold mb-8">Category: {posts[0].category?.name || slug}</h1>
      {posts.map((post) => <PostCard key={post.id} post={post} />)}
    </PageWrapper>
  );
}
