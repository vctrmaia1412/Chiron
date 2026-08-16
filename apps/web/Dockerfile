# syntax=docker/dockerfile:1.7
# O Next.js gera saída standalone: a imagem final leva só o servidor
# resultante e os estáticos, sem node_modules completo.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @chiron/web... --filter @chiron/web^...

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @chiron/contracts build \
 && pnpm --filter @chiron/domain build \
 && pnpm --filter @chiron/web build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 chiron \
 && useradd --system --uid 1001 --gid chiron chiron

COPY --from=build --chown=chiron:chiron /repo/apps/web/.next/standalone ./
COPY --from=build --chown=chiron:chiron /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=chiron:chiron /repo/apps/web/public ./apps/web/public

USER chiron
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=4 \
  CMD curl -fsS http://127.0.0.1:3000/entrar || exit 1

CMD ["node", "apps/web/server.js"]
