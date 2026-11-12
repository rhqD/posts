import HeroSection from "./HeroSection";
import AboutSection from "./AboutSection";
import SkillsSection from "./SkillsSection";
import TimelineSection from "./TimelineSection";
import PostsSection from "./PostsSection";
import ContactSection from "./ContactSection";
import type { Profile, Skill, Experience, Post } from "@/lib/types";

type Props = {
  profile: Profile | null;
  skills: Skill[];
  experiences: Experience[];
  posts: Post[];
};

export default function HomeSectionRenderer({ profile, skills, experiences, posts }: Props) {
  return (
    <>
      <HeroSection profile={profile} />
      <AboutSection profile={profile} />
      <SkillsSection skills={skills} />
      <TimelineSection experiences={experiences} />
      <PostsSection posts={posts} />
      <ContactSection profile={profile} />
    </>
  );
}
