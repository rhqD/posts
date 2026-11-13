package store

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"
)

// NewID returns a lexicographically sortable identifier: time prefix + entropy.
// IDs are minted here, not by the backend, so switching to SQL keeps every
// existing reference valid.
func NewID() ID {
	var b [6]byte
	_, _ = rand.Read(b[:])
	return ID(fmt.Sprintf("%013d%s", time.Now().UnixMilli(), hex.EncodeToString(b[:])))
}
