// Package content defines the build-time content contract shared with the
// web app (see content/README.md). JSON tags must match src/lib/types.ts.
package content

type Category struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	CreatedAt string `json:"created_at"`
}

type Tag struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	CreatedAt string `json:"created_at"`
}

type Post struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Slug        string    `json:"slug"`
	Content     *string   `json:"content"`
	Excerpt     *string   `json:"excerpt"`
	CoverURL    *string   `json:"cover_url"`
	CategoryID  *string   `json:"category_id"`
	Status      string    `json:"status"`
	PublishedAt *string   `json:"published_at"`
	CreatedAt   string    `json:"created_at"`
	UpdatedAt   string    `json:"updated_at"`
	Category    *Category `json:"category,omitempty"`
	Tags        []Tag     `json:"tags,omitempty"`
}

// PostFile is content/posts/<slug>.json
type PostFile struct {
	Post   Post             `json:"post"`
	Blocks []map[string]any `json:"blocks"`
}

type ManifestPost struct {
	Slug       string `json:"slug"`
	LastEdited string `json:"last_edited"`
}

type Manifest struct {
	GeneratedAt        string                  `json:"generated_at"`
	DatabaseLastEdited string                  `json:"database_last_edited,omitempty"`
	Posts              map[string]ManifestPost `json:"posts"`
}
