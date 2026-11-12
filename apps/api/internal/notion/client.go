// Package notion is a minimal Notion REST client (stdlib only).
package notion

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const (
	apiBase = "https://api.notion.com/v1/"
	version = "2022-06-28"
)

type Client struct {
	apiKey string
	http   *http.Client
}

func New(apiKey string) *Client {
	return &Client{apiKey: apiKey, http: &http.Client{Timeout: 30 * time.Second}}
}

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var raw []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		raw = b
	}

	for attempt := 0; attempt < 4; attempt++ {
		var rdr io.Reader
		if raw != nil {
			rdr = bytes.NewReader(raw)
		}
		req, err := http.NewRequestWithContext(ctx, method, apiBase+path, rdr)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
		req.Header.Set("Notion-Version", version)
		if raw != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		res, err := c.http.Do(req)
		if err != nil {
			return err
		}
		data, readErr := io.ReadAll(res.Body)
		res.Body.Close()
		if readErr != nil {
			return readErr
		}

		if res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500 {
			wait := time.Duration(attempt+1) * time.Second
			if ra := res.Header.Get("Retry-After"); ra != "" {
				if secs, err := strconv.Atoi(ra); err == nil {
					wait = time.Duration(secs) * time.Second
				}
			}
			time.Sleep(wait)
			continue
		}
		if res.StatusCode >= 300 {
			return fmt.Errorf("notion %s %s: %d %s", method, path, res.StatusCode, string(data))
		}
		if out != nil {
			return json.Unmarshal(data, out)
		}
		return nil
	}
	return fmt.Errorf("notion %s %s: retries exhausted", method, path)
}

type queryResponse struct {
	Results    []json.RawMessage `json:"results"`
	HasMore    bool              `json:"has_more"`
	NextCursor *string           `json:"next_cursor"`
}

// QueryDatabase returns every matching page, following pagination.
func (c *Client) QueryDatabase(ctx context.Context, dbID string, payload map[string]any) ([]json.RawMessage, error) {
	var all []json.RawMessage
	cursor := ""
	for {
		body := map[string]any{"page_size": 100}
		for k, v := range payload {
			body[k] = v
		}
		if cursor != "" {
			body["start_cursor"] = cursor
		}

		var out queryResponse
		if err := c.do(ctx, http.MethodPost, "databases/"+dbID+"/query", body, &out); err != nil {
			return nil, err
		}
		all = append(all, out.Results...)
		if !out.HasMore || out.NextCursor == nil || *out.NextCursor == "" {
			break
		}
		cursor = *out.NextCursor
	}
	return all, nil
}

type childrenResponse struct {
	Results    []map[string]any `json:"results"`
	HasMore    bool             `json:"has_more"`
	NextCursor *string          `json:"next_cursor"`
}

// BlockTree returns the full block tree of a page, with "children" attached.
func (c *Client) BlockTree(ctx context.Context, blockID string) ([]map[string]any, error) {
	children, err := c.children(ctx, blockID)
	if err != nil {
		return nil, err
	}
	for _, b := range children {
		if has, _ := b["has_children"].(bool); has {
			id, _ := b["id"].(string)
			sub, err := c.BlockTree(ctx, id)
			if err != nil {
				return nil, err
			}
			b["children"] = sub
		} else {
			b["children"] = []map[string]any{}
		}
	}
	return children, nil
}

func (c *Client) children(ctx context.Context, id string) ([]map[string]any, error) {
	var all []map[string]any
	cursor := ""
	for {
		q := url.Values{}
		q.Set("page_size", "100")
		if cursor != "" {
			q.Set("start_cursor", cursor)
		}
		var out childrenResponse
		if err := c.do(ctx, http.MethodGet, "blocks/"+id+"/children?"+q.Encode(), nil, &out); err != nil {
			return nil, err
		}
		all = append(all, out.Results...)
		if !out.HasMore || out.NextCursor == nil || *out.NextCursor == "" {
			break
		}
		cursor = *out.NextCursor
	}
	return all, nil
}
