# One image for both processes: the API (default command) and the worker
# (docker-compose.prod.yml overrides the command with `node dist/worker.js`).
FROM node:20-bookworm-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

# Apply pending migrations before the API starts serving. The Prisma CLI is a
# dev dependency, so dev dependencies are deliberately kept in the image.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
