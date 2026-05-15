# Multi-stage Dockerfile for SaludDeUna (Node 20 + NestJS)
# alpine3.21 fijado + apk upgrade para parchear CVEs de sistema
FROM node:20-alpine3.21 AS builder
WORKDIR /app

RUN apk upgrade --no-cache && \
    apk add --no-cache python3 make g++ git

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine3.21 AS runner
WORKDIR /app

RUN apk upgrade --no-cache

ENV NODE_ENV=production
ENV APP_RUNTIME_ROLE=api

COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/docker ./docker

USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 CMD ["node", "docker/healthcheck.js"]

CMD ["node", "dist/main"]
