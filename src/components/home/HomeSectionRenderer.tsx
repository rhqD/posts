"use client";

import { useEffect, useState } from "react";
import HeroSection from "./HeroSection";
import AboutSection from "./AboutSection";
import SkillsSection from "./SkillsSection";
import TimelineSection from "./TimelineSection";
import PostsSection from "./PostsSection";
import ContactSection from "./ContactSection";
import type { HomepageData } from "@/lib/supabase/types";

const emptyData: HomepageData = {
  profile: null,
  skills: [],
  experiences: [],
  featuredPosts: [],
};

export default function HomeSectionRenderer({ data }: { data: HomepageData | null }) {
  const [liveData, setLiveData] = useState<HomepageData>(data ?? emptyData);

  useEffect(() => {
    if (data) return;
    fetch("/api/bio/all")
      .then((r) => r.json())
      .then((d) => setLiveData(d))
      .catch(() => {});
  }, [data]);

  return (
    <div className="dark">
      <HeroSection profile={liveData.profile} />
      <AboutSection profile={liveData.profile} />
      <SkillsSection skills={liveData.skills} />
      <TimelineSection experiences={liveData.experiences} />
      <PostsSection posts={liveData.featuredPosts} />
      <ContactSection profile={liveData.profile} />
    </div>
  );
}
