SHELL := /bin/bash
CURDIR := $(shell pwd)
ENV_LOAD = set -a; [ -f .env.local ] && . ./.env.local; set +a;

.PHONY: dev build sync sync-force images deploy clean control-build control-test control-dev control-verify

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

# Pull the latest 3D model + lamp config from ../yabai_home (viewer UI is ours)
sync-yard:
	node scripts/sync-yard.mjs

# One-shot publish: Notion -> content -> images -> build -> OSS
publish: sync images deploy

# Build + upload out/ to OSS
deploy:
	pnpm build
	BUCKET=$(or $(BUCKET),oss://renhanquan-site) ./scripts/deploy.sh

clean:
	rm -rf .next out

# ---- control service (device gateway) ----
control-build:
	cd apps/control && go build -o ../../bin/control ./cmd/server

control-test:
	cd apps/control && go test ./...

# Local run with a fake SMS provider; prints the login code to stdout
control-dev:
	@$(ENV_LOAD) cd apps/control && ADDR=$${ADDR:-:8080} DATA_DIR=$${DATA_DIR:-./data} \
	  SMS_MODE=$${SMS_MODE:-fake} COOKIE_SECURE=$${COOKIE_SECURE:-false} \
	  go run ./cmd/server

# Replay the audit chain; non-zero exit means the trail was tampered with
control-verify:
	@cd apps/control && DATA_DIR=$${DATA_DIR:-./data} go run ./cmd/server verify
