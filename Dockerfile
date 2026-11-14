# Stage 1: Build frontend
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build Go binary
FROM golang:1.27-alpine@sha256:eb61c3873c97416fff0116553fff65d67a3549f72e11d9758849a689cdd8b523 AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o wedding ./cmd/wedding && mkdir /empty

# Stage 3: Runtime. No shell or package manager, only the binary, CA
# certificates and time zone data.
FROM gcr.io/distroless/static-debian12@sha256:d75cdd72874d4790092fcb1b058493ecf6bb5bf2b2b897045b00ff01d91843f2
COPY --from=backend /app/wedding /app/wedding
COPY --from=backend --chown=1000:1000 /empty /data
COPY --from=backend --chown=1000:1000 /empty /config
WORKDIR /app
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/app/wedding", "healthcheck"]
ENTRYPOINT ["/app/wedding"]
CMD ["serve"]
