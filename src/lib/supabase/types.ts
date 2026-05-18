export type Category = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type Tag = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type Post = {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  excerpt: string | null;
  cover_url: string | null;
  category_id: string | null;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
  category?: Category;
  tags?: Tag[];
};

// === Bio / Resume Types ===

export type SocialLinks = {
  github?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
};

export type Profile = {
  id: string;
  full_name: string;
  headline: string;
  bio: string;
  avatar_url: string | null;
  location: string | null;
  email: string | null;
  resume_url: string | null;
  social_links: SocialLinks | null;
  created_at: string;
  updated_at: string;
};

export type Skill = {
  id: string;
  name: string;
  category: string;
  proficiency: number;
  icon_name: string | null;
  sort_order: number;
};

export type Experience = {
  id: string;
  company: string;
  role: string;
  description: string;
  start_date: string;
  end_date: string | null;
  location: string | null;
  company_url: string | null;
  logo_url: string | null;
  sort_order: number;
};

export type HomepageData = {
  profile: Profile | null;
  skills: Skill[];
  experiences: Experience[];
  featuredPosts: Post[];
};
