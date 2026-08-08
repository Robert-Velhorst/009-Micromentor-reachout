FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    MARO_DATA_DIR=/app/data
WORKDIR /app

RUN addgroup -S maro && adduser -S -G maro maro && mkdir -p /app/data && chown -R maro:maro /app
COPY --from=build --chown=maro:maro /app/dist ./dist
COPY --from=build --chown=maro:maro /app/node_modules ./node_modules
COPY --from=build --chown=maro:maro /app/package.json ./package.json

USER maro
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/readiness >/dev/null || exit 1
CMD ["node", "dist/index.cjs"]
