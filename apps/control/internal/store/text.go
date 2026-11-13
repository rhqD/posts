package store

// MaskPhone keeps the first three and last four digits: 138****5678.
func MaskPhone(p string) string {
	if len(p) <= 7 {
		return "***"
	}
	return p[:3] + "****" + p[len(p)-4:]
}
