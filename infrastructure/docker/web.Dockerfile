FROM node:22.21.1-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/music-core/package.json ./packages/music-core/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY apps/web ./apps/web
COPY packages ./packages
RUN pnpm --filter @frasi/web build

FROM node:22.21.1-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN useradd --create-home --uid 10001 frasi
WORKDIR /app
COPY --from=builder --chown=frasi:frasi /app/apps/web/.next/standalone ./
COPY --from=builder --chown=frasi:frasi /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=frasi:frasi /app/apps/web/public ./apps/web/public
USER frasi
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
