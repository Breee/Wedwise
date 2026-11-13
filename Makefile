.PHONY: dev build test lint clean docker-build up down

# Build the Go binary
build:
	cd web && npm install && npm run build
	go build -o bin/wedding ./cmd/wedding

# Run backend dev server
dev-backend:
	go run ./cmd/wedding serve

# Run frontend dev server
dev-frontend:
	cd web && npm run dev

# Run tests
test:
	go test ./...

# Lint
lint:
	golangci-lint run

# Clean build artifacts
clean:
	rm -rf bin/ web/dist/

# Build container image
docker-build:
	docker build -t wedwise:latest .

# Run container locally
docker-run:
	docker run -p 8080:8080 \
		-v wedwise-data:/data \
		-e SESSION_SECRET=dev-secret-change-me \
		-e DATA_KEY=dev-data-key-change-me-32-characters \
		wedwise:latest

up:
	@test -d local || { mkdir -p local && cp examples/config.yaml local/config.yaml && cp examples/content.json local/content.json && echo "Created local/ from examples/ – edit it for your wedding"; }
	docker compose up -d --build --wait
	@for r in admin couple witness; do \
		docker compose exec -T wedwise /app/wedding user create --username $$r --role $$r --email $$r@example.com --password $${r}12345 >/dev/null 2>&1 || true; \
	done
	@if curl -sf localhost:8080/api/content/public | grep -q '"schedule":\(null\|\[\]\)'; then \
		curl -sf -c /tmp/wedwise.cookies -H 'Origin: http://localhost:8080' -H 'Content-Type: application/json' \
			-d '{"username":"admin","password":"admin12345"}' localhost:8080/api/auth/login >/dev/null && \
		curl -sf -b /tmp/wedwise.cookies -X PUT -H 'Origin: http://localhost:8080' -H 'Content-Type: application/json' \
			--data @local/content.json localhost:8080/api/content >/dev/null && echo "Seeded content from local/content.json"; \
		rm -f /tmp/wedwise.cookies; \
	fi
	@echo "Wedwise: http://localhost:8080 — users: admin/admin12345, couple/couple12345, witness/witness12345"

down:
	docker compose down
