import { getHomepageData } from "@/lib/supabase/bio";
import HomeSectionRenderer from "@/components/home/HomeSectionRenderer";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getHomepageData();

  return <HomeSectionRenderer data={data} />;
}
