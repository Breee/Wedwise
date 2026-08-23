.PHONY: dev build test lint clean docker-build

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
		wedwise:latest
