// Static bio data. Edit this file to update the homepage — no database involved.
// Skills/experiences are ordered by array position; "sort_order" exists only for type
// compatibility with the existing components and is ignored for ordering.

import type { Profile, Skill, Experience } from "@/lib/types";

export const profile: Profile = {
  id: "me",
  full_name: "Ren Hanquan",
  headline: "Senior Frontend Engineer — Frontend Performance, Low-Code Platforms, and Gardening",
  bio: "Senior frontend engineer specializing in large-scale application architecture and full-lifecycle performance optimization. From Xi'an, Shaanxi. Career spans collaborative tools, Web3, and low-code platforms. Avid gardener.",
  avatar_url: null,
  location: "Hangzhou",
  email: null,
  resume_url: null,
  social_links: {
    github: "https://github.com/rhqD",
  },
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
};

// TODO: fill in real data (exported from the old Supabase tables)
export const skills: Skill[] = [];

// TODO: fill in real data (exported from the old Supabase tables)
export const experiences: Experience[] = [];
