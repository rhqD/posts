package content

import (
	"fmt"
	"path/filepath"
	"regexp"
)

var validSlug = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$`)

func ValidateSlug(slug string) error {
	if !validSlug.MatchString(slug) {
		return fmt.Errorf("invalid post slug %q: use 1-200 ASCII letters, digits, hyphens or underscores, starting with a letter or digit", slug)
	}
	return nil
}

func PostPath(dir, slug string) (string, error) {
	if err := ValidateSlug(slug); err != nil {
		return "", err
	}
	path := filepath.Join(dir, slug+".json")
	rel, err := filepath.Rel(dir, path)
	if err != nil || rel != slug+".json" {
		return "", fmt.Errorf("post path escapes content directory")
	}
	return path, nil
}
