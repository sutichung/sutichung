FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=10000
COPY ant-testnet-status.js ./ant-testnet-status.js
EXPOSE 10000
USER node
CMD ["node", "ant-testnet-status.js"]
