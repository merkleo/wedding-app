# Stage 1 – Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# libc6-compat necesario para algunos binarios nativos (sharp) en Alpine
RUN apk add --no-cache libc6-compat && \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Stage 2 – Build
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat curl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Descargar fuente Dancing Script (para el efecto Polaroid)
RUN mkdir -p /app/public/fonts && \
    curl -fsSL \
      "https://github.com/google/fonts/raw/main/ofl/dancingscript/static/DancingScript-Regular.ttf" \
      -o /app/public/fonts/DancingScript-Regular.ttf

RUN mkdir -p /app/public && npm run build

# Stage 3 – Production runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache libc6-compat && \
    addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
