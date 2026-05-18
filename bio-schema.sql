-- Run this in Supabase SQL Editor to set up bio/resume tables

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  location TEXT,
  email TEXT,
  resume_url TEXT,
  social_links JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Authenticated full access profiles" ON public.profiles
  FOR ALL USING (true) WITH CHECK (true);

-- Skills table
CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  proficiency INTEGER NOT NULL DEFAULT 50 CHECK (proficiency >= 0 AND proficiency <= 100),
  icon_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read skills" ON public.skills
  FOR SELECT USING (true);

CREATE POLICY "Authenticated full access skills" ON public.skills
  FOR ALL USING (true) WITH CHECK (true);

-- Experiences table
CREATE TABLE IF NOT EXISTS public.experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE,
  location TEXT,
  company_url TEXT,
  logo_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read experiences" ON public.experiences
  FOR SELECT USING (true);

CREATE POLICY "Authenticated full access experiences" ON public.experiences
  FOR ALL USING (true) WITH CHECK (true);

-- Insert a default profile row so getHomepageData always returns a profile
INSERT INTO public.profiles (full_name, headline, bio)
VALUES ('Your Name', 'Developer & Writer', 'Write something about yourself here.')
ON CONFLICT DO NOTHING;
