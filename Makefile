.PHONY: demo dev build test lint clean docker-build up https down

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

BASE_URL ?= http://localhost:8080
TRUST_PROXY_HEADERS ?= false

up:
	@test -d local || { mkdir -p local && cp examples/config.yaml local/config.yaml && cp examples/content.json local/content.json && echo "Created local/ from examples/ – edit it for your wedding"; }
	BASE_URL=$(BASE_URL) TRUST_PROXY_HEADERS=$(TRUST_PROXY_HEADERS) docker compose up -d --build --wait
	@for r in admin couple witness; do \
		docker compose exec -T wedwise /app/wedding user create --username $$r --role $$r --email $$r@example.com --password $${r}12345 >/dev/null 2>&1 || true; \
	done
	@if curl -sf localhost:8080/api/content/public | grep -q '"schedule":\(null\|\[\]\)'; then \
		curl -sf -c /tmp/wedwise.cookies -H 'Origin: $(BASE_URL)' -H 'Content-Type: application/json' \
			-d '{"username":"admin","password":"admin12345"}' localhost:8080/api/auth/login >/dev/null && \
		curl -sf -b /tmp/wedwise.cookies -X PUT -H 'Origin: $(BASE_URL)' -H 'Content-Type: application/json' \
			--data @local/content.json localhost:8080/api/content >/dev/null && echo "Seeded content from local/content.json"; \
		rm -f /tmp/wedwise.cookies; \
	fi
	@echo "Wedwise: http://localhost:8080 — users: admin/admin12345, couple/couple12345, witness/witness12345"

# Local HTTPS at https://wedding.local for testing on phones in the same network.
HTTPS_HOST ?= wedding.local
LAN_IP ?= $(shell hostname -I | cut -d' ' -f1)
CERTS := local/certs

$(CERTS)/server.crt:
	@mkdir -p $(CERTS)
	openssl req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=Wedwise local CA" \
		-addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
		-keyout $(CERTS)/ca.key -out $(CERTS)/ca.crt
	openssl req -newkey rsa:2048 -nodes -subj "/CN=$(HTTPS_HOST)" \
		-keyout $(CERTS)/server.key -out $(CERTS)/server.csr
	printf 'subjectAltName=DNS:$(HTTPS_HOST),DNS:localhost,IP:$(LAN_IP),IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' > $(CERTS)/server.ext
	openssl x509 -req -days 397 -in $(CERTS)/server.csr -CA $(CERTS)/ca.crt -CAkey $(CERTS)/ca.key \
		-CAcreateserial -extfile $(CERTS)/server.ext -out $(CERTS)/server.crt
	chmod 644 $(CERTS)/server.key

https: $(CERTS)/server.crt
	$(MAKE) up BASE_URL=https://$(HTTPS_HOST) TRUST_PROXY_HEADERS=true
	BASE_URL=https://$(HTTPS_HOST) TRUST_PROXY_HEADERS=true docker compose --profile https up -d
	@if [ -f $(CERTS)/mdns.pid ]; then kill `cat $(CERTS)/mdns.pid` 2>/dev/null || true; fi
	@nohup avahi-publish -a -R $(HTTPS_HOST) $(LAN_IP) >/dev/null 2>&1 & echo $$! > $(CERTS)/mdns.pid
	@echo "Wedwise: https://$(HTTPS_HOST) ($(LAN_IP)) — install $(CERTS)/ca.crt on each phone first"

down:
	@if [ -f local/certs/mdns.pid ]; then kill `cat local/certs/mdns.pid` 2>/dev/null || true; rm -f local/certs/mdns.pid; fi
	docker compose --profile https down

demo: ## Fill the local database with made-up responses
	docker compose exec -T wedwise /app/wedding demo
