// Keep in sync with apps/api/internal/content/slug.go. Reject unsafe slugs
// instead of silently changing published URLs or allowing path traversal.
export function validatePostSlug(slug: string): void {
  if (typeof slug !== "string" || slug.length < 1 || slug.length > 200 ||
      !/^[a-zA-Z0-9]/.test(slug) || /[^a-zA-Z0-9_-]/.test(slug)) {
    throw new Error(`Invalid post slug: ${JSON.stringify(slug)}`);
  }
}
