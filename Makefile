SHELL := /bin/bash
CURDIR := $(shell pwd)
ENV_LOAD = set -a; [ -f .env.local ] && . ./.env.local; set +a;

.PHONY: dev build sync sync-force images deploy clean

# Local dev server
dev:
	pnpm dev

# Production build (static export into out/)
build:
	pnpm build

# Notion -> content/
sync:
	@$(ENV_LOAD) cd apps/api && GOCACHE=$(CURDIR)/apps/api/.gocache go run ./cmd/sync -out ../../content

# Ignore the manifest cache and refetch every post
sync-force:
	@$(ENV_LOAD) cd apps/api && GOCACHE=$(CURDIR)/apps/api/.gocache go run ./cmd/sync -out ../../content -force

# Images -> OSS (download, resize, WebP, rewrite URLs)
images:
	node scripts/images.mjs

# One-shot publish: Notion -> content -> images -> build -> OSS
publish: sync images deploy

# Build + upload out/ to OSS
deploy:
	pnpm build
	BUCKET=$(or $(BUCKET),oss://renhanquan-site) ./scripts/deploy.sh

clean:
	rm -rf .next out
