# Multi-stage Dockerfile for SaludDeUna (Node 20 + NestJS)
FROM node:20-alpine AS builder
WORKDIR /app

# Install build tools required by some native deps
RUN apk add --no-cache python3 make g++ git

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy sources and build
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy runtime artifacts
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/docker ./docker

USER node

EXPOSE 3000

CMD ["node", "dist/main"]
