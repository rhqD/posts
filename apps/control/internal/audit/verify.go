package audit

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"

	"renhanquan/control/internal/store"
)

// VerifyResult reports the outcome of replaying an audit file.
type VerifyResult struct {
	Entries int    `json:"entries"`
	OK      bool   `json:"ok"`
	Broken  string `json:"broken_id,omitempty"`
	Reason  string `json:"reason,omitempty"`
}

// Verify replays path and recomputes the hash chain. A truncation, a deleted
// line or an edited field all show up as a break, which is the whole point of
// chaining: the file is append-only, the chain makes it tamper-evident.
func Verify(path string) (VerifyResult, error) {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return VerifyResult{OK: true}, nil
		}
		return VerifyResult{}, err
	}
	defer f.Close()

	res := VerifyResult{OK: true}
	prev := ""
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)

	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var e store.Entry
		if err := json.Unmarshal(line, &e); err != nil {
			res.OK = false
			res.Reason = "unparsable line " + err.Error()
			return res, nil
		}
		res.Entries++
		if e.PrevHash != prev {
			res.OK = false
			res.Broken = e.ID
			res.Reason = "prev_hash does not match previous entry (a line was removed, inserted or reordered)"
			return res, nil
		}
		want := e.Hash
		e.Hash = ""
		payload, err := json.Marshal(e)
		if err != nil {
			return res, err
		}
		sum := sha256.Sum256(append([]byte(prev), payload...))
		if got := hex.EncodeToString(sum[:]); got != want {
			res.OK = false
			res.Broken = e.ID
			res.Reason = "hash mismatch (entry was modified)"
			return res, nil
		}
		prev = want
	}
	if err := sc.Err(); err != nil {
		return res, err
	}
	return res, nil
}
