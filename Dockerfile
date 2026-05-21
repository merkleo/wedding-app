# Stage 1 – Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Stage 2 – Build
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/public && npm run build

# Stage 3 – Production runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# fontconfig: necesario para que librsvg (usado por Sharp) resuelva fuentes por nombre
RUN apk add --no-cache libc6-compat fontconfig && \
    addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copiar app (aún como root para poder instalar la fuente)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Instalar Dancing Script en el sistema → librsvg lo encuentra por nombre de familia
RUN mkdir -p /usr/local/share/fonts/truetype && \
    cp /app/public/fonts/DancingScript-Regular.ttf \
       /usr/local/share/fonts/truetype/DancingScript-Regular.ttf && \
    fc-cache -f /usr/local/share/fonts/truetype

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
