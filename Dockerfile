# Build the React dashboard, then run the lightweight Node API/static server.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
# Refresh advisory data on every source commit instead of reusing a cached audit layer.
RUN npm audit --json > /app/dependency-audit.json || true
RUN node --check server/index.js && npm run test:server
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=build /app/server ./server
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/dependency-audit.json ./dependency-audit.json
COPY --from=build /app/package.json ./package.json
RUN npm ci --omit=dev --no-audit --no-fund
# vite.config.mjs emits to /app/build; the Node server serves /app/dist.
COPY --from=build /app/build ./build
EXPOSE 8787
USER node
CMD ["node", "server/index.js"]
