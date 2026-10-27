FROM debian:trixie-slim@sha256:62bd423aeee912639ca8ee681c2b762cb3e25137e0a92b20be455898a9f034ad AS node-runtime
ARG TARGETARCH
WORKDIR /tmp
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils libatomic1 \
 && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) node_arch=x64; node_sha=fd47865ecd6391ebb431fc815e01b9135bf83ded5cf373247e9331e196b7aded ;; \
      arm64) node_arch=arm64; node_sha=fd6cc729fa4448c2ac27c3fca5606019ced63c65a15c152c8df03e0cbce7f4c5 ;; \
      *) echo "Unsupported target architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl --fail --location --silent --show-error \
      "https://nodejs.org/dist/v26.12.0/node-v26.12.0-linux-${node_arch}.tar.xz" \
      --output node.tar.xz; \
    echo "${node_sha}  node.tar.xz" | sha256sum --check --status; \
    tar -xJf node.tar.xz --directory /usr/local --strip-components=1; \
    rm node.tar.xz; \
    node --version | grep --fixed-strings --line-regexp "v26.12.0"

FROM node-runtime AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm audit --audit-level=low
COPY . .
RUN npm run check:release

FROM nginx:1.31.7-alpine@sha256:892bb2152464f0c5d8972593a5f5afaf8054552580b699d95f8ff4af08c2d33d AS runtime

COPY --from=build /app/dist /usr/share/nginx/html

RUN printf 'server {\n    listen 80;\n    location / {\n        root /usr/share/nginx/html;\n        index index.html;\n        try_files $uri $uri/ /index.html;\n    }\n}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]