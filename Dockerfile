# Build the React dashboard, then run the lightweight Node API/static server.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV NODE_OPTIONS=--openssl-legacy-provider
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=build /app/server ./server
COPY --from=build /app/build ./build
EXPOSE 8787
USER node
CMD ["node", "server/index.js"]
