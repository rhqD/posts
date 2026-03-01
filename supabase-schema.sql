-- Run this SQL in your Supabase SQL editor

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz default now()
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  content text,
  excerpt text,
  cover_url text,
  category_id uuid references categories(id) on delete set null,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table post_tags (
  post_id uuid references posts(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

-- RLS
alter table posts enable row level security;
create policy "public read published" on posts for select using (status = 'published');
create policy "authenticated full access" on posts for all using (auth.role() = 'authenticated');

-- Storage bucket for images
insert into storage.buckets (id, name, public) values ('images', 'images', true);
create policy "public read images" on storage.objects for select using (bucket_id = 'images');
create policy "authenticated upload images" on storage.objects for insert with check (bucket_id = 'images' and auth.role() = 'authenticated');
