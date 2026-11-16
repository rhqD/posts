package notion

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestMapPageRejectsUnsafeExplicitSlugs(t *testing.T) {
	for _, slug := range []string{"../../package", "../manifest", "/tmp/escape", `..\escape`, "a/b", "a%2fb", "%2e%2e", ".", "..", "a\x00b", strings.Repeat("a", 201)} {
		raw, _ := json.Marshal(map[string]any{"id": "page", "properties": map[string]any{"slug": map[string]any{"rich_text": []any{map[string]any{"plain_text": slug}}}}})
		if _, err := MapPage(raw); err == nil {
			t.Errorf("accepted unsafe slug %q", slug)
		}
	}
	for _, raw := range []string{`{"id":"ab-cd","properties":{"title":{"title":[{"plain_text":"中文"}]}}}`, `{"id":"page","properties":{"slug":{"rich_text":[{"plain_text":"safe-post_1"}]}}}`} {
		if _, err := MapPage(json.RawMessage(raw)); err != nil {
			t.Fatal(err)
		}
	}
}
