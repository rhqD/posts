import HomeSectionRenderer from "@/components/home/HomeSectionRenderer";
import { profile, skills, experiences } from "@/content/bio";
import { getFeaturedPosts } from "@/lib/notion";

export const dynamic = "force-static";

export default async function HomePage() {
  const featuredPosts = await getFeaturedPosts(4);

  return (
    <HomeSectionRenderer
      profile={profile}
      skills={skills}
      experiences={experiences}
      posts={featuredPosts}
    />
  );
}
