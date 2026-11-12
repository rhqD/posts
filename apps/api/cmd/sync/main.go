// Command sync pulls published posts from Notion and writes the build-time
// content snapshot consumed by the web app (content/posts.index.json and
// content/posts/<slug>.json). Run it in CI before building the site.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"renhanquan/api/internal/content"
	"renhanquan/api/internal/notion"
)

func main() {
	outDir := flag.String("out", "content", "output directory for the content snapshot")
	dbID := flag.String("db", "", "Notion database id (defaults to $NOTION_DATABASE_ID)")
	concurrency := flag.Int("concurrency", 3, "parallel block fetches (Notion rate limit is ~3 rps)")
	force := flag.Bool("force", false, "ignore the manifest cache and refetch every post")
	prune := flag.Bool("prune", false, "delete post files that no longer exist in Notion")
	flag.Parse()

	key := os.Getenv("NOTION_API_KEY")
	if key == "" {
		log.Fatal("NOTION_API_KEY is required")
	}
	database := *dbID
	if database == "" {
		database = os.Getenv("NOTION_DATABASE_ID")
	}
	if database == "" {
		database = "21fc53874c4e8071b064ff3db3afdf6c"
	}

	ctx := context.Background()
	client := notion.New(key)

	manifestPath := filepath.Join(*outDir, "manifest.json")
	manifest := loadManifest(manifestPath)
	if *force {
		manifest.Posts = map[string]content.ManifestPost{}
	}

	rawPages, err := client.QueryDatabase(ctx, database, map[string]any{
		"filter": map[string]any{
			"and": []any{
				map[string]any{"property": "status", "select": map[string]any{"equals": "Published"}},
				map[string]any{"property": "type", "select": map[string]any{"equals": "Post"}},
			},
		},
		"sorts": []any{map[string]any{"property": "date", "direction": "descending"}},
	})
	if err != nil {
		log.Fatalf("query database %s: %v", database, err)
	}

	posts := make([]content.Post, 0, len(rawPages))
	for _, raw := range rawPages {
		p, err := notion.MapPage(raw)
		if err != nil {
			log.Fatalf("map page: %v", err)
		}
		posts = append(posts, p)
	}
	sort.SliceStable(posts, func(i, j int) bool { return postTime(posts[i]).After(postTime(posts[j])) })

	idToSlug := make(map[string]string, len(posts))
	for _, p := range posts {
		idToSlug[strings.ReplaceAll(p.ID, "-", "")] = p.Slug
	}

	postsDir := filepath.Join(*outDir, "posts")
	if err := os.MkdirAll(postsDir, 0o755); err != nil {
		log.Fatal(err)
	}

	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		firstErr error
		fetched  int
		reused   int
	)
	sem := make(chan struct{}, *concurrency)

	for _, p := range posts {
		path := filepath.Join(postsDir, p.Slug+".json")
		prev, seen := manifest.Posts[p.ID]
		if !*force && seen && prev.LastEdited == p.UpdatedAt && fileExists(path) {
			mu.Lock()
			reused++
			mu.Unlock()
			continue
		}

		wg.Add(1)
		go func(p content.Post, path string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			blocks, err := client.BlockTree(ctx, p.ID)
			if err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("%s: %w", p.Slug, err)
				}
				mu.Unlock()
				return
			}
			notion.RewriteLinks(blocks, idToSlug)

			if err := writeJSON(path, content.PostFile{Post: p, Blocks: blocks}); err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				mu.Unlock()
				return
			}

			mu.Lock()
			manifest.Posts[p.ID] = content.ManifestPost{Slug: p.Slug, LastEdited: p.UpdatedAt}
			fetched++
			mu.Unlock()
		}(p, path)
	}
	wg.Wait()
	if firstErr != nil {
		log.Fatalf("sync failed: %v", firstErr)
	}

	if err := writeJSON(filepath.Join(*outDir, "posts.index.json"), posts); err != nil {
		log.Fatal(err)
	}
	manifest.GeneratedAt = time.Now().UTC().Format(time.RFC3339)
	if len(posts) > 0 {
		manifest.DatabaseLastEdited = posts[0].UpdatedAt
	}
	if err := writeJSON(manifestPath, manifest); err != nil {
		log.Fatal(err)
	}

	if *prune {
		keep := make(map[string]bool, len(posts))
		for _, p := range posts {
			keep[p.Slug+".json"] = true
		}
		entries, err := os.ReadDir(postsDir)
		if err == nil {
			for _, e := range entries {
				if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") || keep[e.Name()] {
					continue
				}
				if err := os.Remove(filepath.Join(postsDir, e.Name())); err != nil {
					log.Printf("prune %s: %v", e.Name(), err)
				} else {
					log.Printf("pruned %s", e.Name())
				}
			}
		}
	}

	log.Printf("sync done: %d posts (%d fetched, %d reused)", len(posts), fetched, reused)
}

func loadManifest(path string) content.Manifest {
	m := content.Manifest{Posts: map[string]content.ManifestPost{}}
	raw, err := os.ReadFile(path)
	if err != nil {
		return m
	}
	if err := json.Unmarshal(raw, &m); err != nil || m.Posts == nil {
		m.Posts = map[string]content.ManifestPost{}
	}
	return m
}

func writeJSON(path string, v any) error {
	raw, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func fileExists(path string) bool {
	st, err := os.Stat(path)
	return err == nil && !st.IsDir()
}

func postTime(p content.Post) time.Time {
	candidates := []string{p.CreatedAt}
	if p.PublishedAt != nil {
		candidates = append([]string{*p.PublishedAt}, candidates...)
	}
	for _, s := range candidates {
		if s == "" {
			continue
		}
		for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05.000Z", "2006-01-02"} {
			if t, err := time.Parse(layout, s); err == nil {
				return t
			}
		}
	}
	return time.Time{}
}
