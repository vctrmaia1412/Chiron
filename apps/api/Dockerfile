# syntax=docker/dockerfile:1.7
# Build da API em estágios: dependências completas para compilar, imagem
# final apenas com o necessário para rodar, sem código-fonte nem devDeps.

FROM node:24-bookworm-slim AS base
ENV CI=true
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /repo

# ------------------------------------------------------------------ deps
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @chiron/api... --filter @chiron/api^...

# ----------------------------------------------------------------- build
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @chiron/contracts build \
 && pnpm --filter @chiron/domain build \
 && pnpm --filter @chiron/api build

# Reinstala só produção, para a imagem final não levar ferramenta de build.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @chiron/api... --filter @chiron/api^...

# ---------------------------------------------------------------- runtime
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
# Fuso fixo: colunas DATE são serializadas com toISOString().slice(0,10) e o
# dia muda se o contêiner rodar em outro fuso.
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
COPY --from=build --chown=chiron:chiron /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=chiron:chiron /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=chiron:chiron /repo/apps/api/migrations ./apps/api/migrations
COPY --from=build --chown=chiron:chiron /repo/apps/api/package.json ./apps/api/

USER chiron
WORKDIR /repo/apps/api
EXPOSE 3333

# /ready e não /health: o liveness responde 200 mesmo com o banco fora.
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=4 \
  CMD curl -fsS http://127.0.0.1:3333/api/v1/ready || exit 1

CMD ["node", "dist/main.js"]
