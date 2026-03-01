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
