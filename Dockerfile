# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build Go binary
FROM golang:1.22-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o wedding ./cmd/wedding

# Stage 3: Runtime
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -s /bin/sh -u 1000 wedding
WORKDIR /app
COPY --from=backend /app/wedding /app/wedding
RUN mkdir -p /data /config && chown -R wedding:wedding /data /config /app
USER wedding
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:8080/healthz || exit 1
ENTRYPOINT ["/app/wedding"]
CMD ["serve"]
