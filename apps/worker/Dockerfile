# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
ENV CI=true
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY apps/worker/package.json apps/worker/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @chiron/worker... --filter @chiron/worker^...

FROM deps AS build
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm --filter @chiron/contracts build \
 && pnpm --filter @chiron/domain build \
 && pnpm --filter @chiron/worker build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @chiron/worker... --filter @chiron/worker^...

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
# Fuso fixo: datas geradas pelos jobs precisam bater com as da API.
ENV TZ=UTC
WORKDIR /repo

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 chiron \
 && useradd --system --uid 1001 --gid chiron chiron

COPY --from=build --chown=chiron:chiron /repo/node_modules ./node_modules
COPY --from=build --chown=chiron:chiron /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=chiron:chiron /repo/packages/contracts/package.json ./packages/contracts/
# pnpm isola dependências por pacote: os symlinks do workspace vivem aqui.
COPY --from=build --chown=chiron:chiron /repo/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build --chown=chiron:chiron /repo/packages/domain/dist ./packages/domain/dist
COPY --from=build --chown=chiron:chiron /repo/packages/domain/package.json ./packages/domain/
COPY --from=build --chown=chiron:chiron /repo/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build --chown=chiron:chiron /repo/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=chiron:chiron /repo/apps/worker/package.json ./apps/worker/

USER chiron
WORKDIR /repo/apps/worker
EXPOSE 3334

# /ready e não /health: só o readiness enxerga relay parado e outbox acumulada.
HEALTHCHECK --interval=20s --timeout=4s --start-period=20s --retries=4 \
  CMD curl -fsS http://127.0.0.1:3334/ready || exit 1

CMD ["node", "dist/main.js"]
