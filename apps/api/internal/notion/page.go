package notion

import (
	"encoding/json"
	"regexp"
	"strings"

	"renhanquan/api/internal/content"
)

var pageIDPattern = regexp.MustCompile(`(?i)([0-9a-f]{32})`)

type rawPage struct {
	ID             string `json:"id"`
	CreatedTime    string `json:"created_time"`
	LastEditedTime string `json:"last_edited_time"`
	Cover          struct {
		External *struct {
			URL string `json:"url"`
		} `json:"external"`
	} `json:"cover"`
	Properties map[string]map[string]any `json:"properties"`
}

// MapPage converts a Notion database page into the shared Post shape.
func MapPage(raw json.RawMessage) (content.Post, error) {
	var p rawPage
	if err := json.Unmarshal(raw, &p); err != nil {
		return content.Post{}, err
	}

	title := textProp(p.Properties, "title")
	if title == "" {
		title = "Untitled"
	}

	slug := textProp(p.Properties, "slug")
	if slug == "" {
		slug = slugify(title)
	}
	if slug == "" {
		slug = strings.ReplaceAll(p.ID, "-", "")
	}

	excerpt := textProp(p.Properties, "summary")
	published := dateProp(p.Properties, "date")
	if published == "" {
		published = p.CreatedTime
	}

	status := "draft"
	if selectProp(p.Properties, "status") == "Published" {
		status = "published"
	}

	cover := textProp(p.Properties, "icon")
	if cover == "" && p.Cover.External != nil {
		cover = p.Cover.External.URL
	}

	var category *content.Category
	if name := selectProp(p.Properties, "category"); name != "" {
		category = &content.Category{ID: name, Name: name, Slug: slugify(name)}
	}

	tags := []content.Tag{}
	for _, name := range multiSelectProp(p.Properties, "tags") {
		tags = append(tags, content.Tag{ID: name, Name: name, Slug: slugify(name)})
	}

	post := content.Post{
		ID:          p.ID,
		Title:       title,
		Slug:        slug,
		Excerpt:     strPtr(excerpt),
		CoverURL:    strPtr(cover),
		Status:      status,
		PublishedAt: strPtr(published),
		CreatedAt:   p.CreatedTime,
		UpdatedAt:   p.LastEditedTime,
		Category:    category,
		Tags:        tags,
	}
	if category != nil {
		post.CategoryID = &category.ID
	}
	return post, nil
}

// RewriteLinks turns Notion page references into /posts/{slug} links, in place.
func RewriteLinks(blocks []map[string]any, idToSlug map[string]string) {
	for _, block := range blocks {
		typ, _ := block["type"].(string)
		if payload, ok := block[typ].(map[string]any); ok {
			if texts, ok := payload["rich_text"].([]any); ok {
				for _, item := range texts {
					rt, ok := item.(map[string]any)
					if !ok {
						continue
					}
					if text, ok := rt["text"].(map[string]any); ok {
						if link, ok := text["link"].(map[string]any); ok {
							rewriteURL(link, idToSlug)
						}
					}
					if href, ok := rt["href"].(string); ok && href != "" {
						if slug := lookupSlug(href, idToSlug); slug != "" {
							rt["href"] = "/posts/" + slug
						}
					}
				}
			}
		}
		if kids, ok := block["children"].([]map[string]any); ok {
			RewriteLinks(kids, idToSlug)
		}
	}
}

func rewriteURL(link map[string]any, idToSlug map[string]string) {
	u, ok := link["url"].(string)
	if !ok {
		return
	}
	if slug := lookupSlug(u, idToSlug); slug != "" {
		link["url"] = "/posts/" + slug
	}
}

func lookupSlug(u string, idToSlug map[string]string) string {
	m := pageIDPattern.FindString(u)
	if m == "" {
		return ""
	}
	return idToSlug[strings.ToLower(m)]
}

func textProp(props map[string]map[string]any, name string) string {
	p, ok := props[name]
	if !ok {
		return ""
	}
	for _, key := range []string{"title", "rich_text"} {
		if arr, ok := p[key].([]any); ok {
			var b strings.Builder
			for _, item := range arr {
				if m, ok := item.(map[string]any); ok {
					if s, ok := m["plain_text"].(string); ok {
						b.WriteString(s)
					}
				}
			}
			return b.String()
		}
	}
	return ""
}

func dateProp(props map[string]map[string]any, name string) string {
	p, ok := props[name]
	if !ok {
		return ""
	}
	if d, ok := p["date"].(map[string]any); ok {
		if s, ok := d["start"].(string); ok {
			return s
		}
	}
	return ""
}

func selectProp(props map[string]map[string]any, name string) string {
	p, ok := props[name]
	if !ok {
		return ""
	}
	if s, ok := p["select"].(map[string]any); ok {
		if n, ok := s["name"].(string); ok {
			return n
		}
	}
	return ""
}

func multiSelectProp(props map[string]map[string]any, name string) []string {
	p, ok := props[name]
	if !ok {
		return nil
	}
	arr, ok := p["multi_select"].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		if m, ok := item.(map[string]any); ok {
			if n, ok := m["name"].(string); ok {
				out = append(out, n)
			}
		}
	}
	return out
}

func slugify(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			prevDash = false
		case !prevDash:
			b.WriteRune('-')
			prevDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
