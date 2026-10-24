FROM node:26.12.1-trixie-slim@sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --global npm@12.2.1
RUN npm ci --ignore-scripts && npm audit --audit-level=low
COPY . .
RUN npm run check:release && npm sbom --omit=dev --sbom-format cyclonedx > dist/runtime-sbom.json

FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 MARO_DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
RUN apk upgrade --no-cache
RUN rm -rf /usr/local/lib/node_modules/npm /opt/yarn-*
RUN rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.cjs"]
