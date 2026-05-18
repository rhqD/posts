"use client";

import HeroSection from "./HeroSection";
import AboutSection from "./AboutSection";
import SkillsSection from "./SkillsSection";
import TimelineSection from "./TimelineSection";
import PostsSection from "./PostsSection";
import ContactSection from "./ContactSection";
import type { HomepageData } from "@/lib/supabase/types";

export default function HomeSectionRenderer({ data }: { data: HomepageData }) {
  return (
    <>
      <HeroSection profile={data.profile} />
      <AboutSection profile={data.profile} />
      <SkillsSection skills={data.skills} />
      <TimelineSection experiences={data.experiences} />
      <PostsSection posts={data.featuredPosts} />
      <ContactSection profile={data.profile} />
    </>
  );
}
