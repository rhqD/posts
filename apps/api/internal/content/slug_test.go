package content

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPostPathCannotEscape(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "content", "posts")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(root, "package.json")
	if err := os.WriteFile(marker, []byte("untouched"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, slug := range []string{"../../package", "../manifest", "/tmp/escape", `..\escape`, "a/b", ""} {
		if _, err := PostPath(dir, slug); err == nil {
			t.Fatalf("accepted %q", slug)
		}
	}
	got, _ := os.ReadFile(marker)
	if string(got) != "untouched" {
		t.Fatal("external file changed")
	}
	path, err := PostPath(dir, "safe-post_1")
	if err != nil || path != filepath.Join(dir, "safe-post_1.json") {
		t.Fatalf("safe path: %q %v", path, err)
	}
}
