import { getHomepageData } from "@/lib/supabase/bio";
import HomeSectionRenderer from "@/components/home/HomeSectionRenderer";

export const revalidate = 3600;

export default async function HomePage() {
  const data = await getHomepageData();

  return <HomeSectionRenderer data={data} />;
}
