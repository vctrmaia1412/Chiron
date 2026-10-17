#!/usr/bin/env bash
# =============================================================================
# CHIRON | Atalho do docker compose da pilha pública (VM na internet)
#
# Monta a linha completa: arquivo principal, sobreposição pública e o
# .env.stack da raiz do repositório. Tudo o que vier depois vai direto para o
# docker compose.
#
#   bash infra/scripts/dc.sh up -d --build      # subir ou atualizar
#   bash infra/scripts/dc.sh ps                 # o que está de pé
#   bash infra/scripts/dc.sh logs -f --tail=100 api
#   bash infra/scripts/dc.sh exec -T postgres psql -U chiron_owner -d chiron
#
# Em todos os comandos do docs/RUNBOOK.md que usam `dc`, este script faz o
# mesmo papel na VM pública. Outro arquivo de ambiente: CHIRON_ENV_FILE=...
# =============================================================================
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
arquivo_env="${CHIRON_ENV_FILE:-${raiz}/.env.stack}"

if [ ! -f "$arquivo_env" ]; then
  echo "Arquivo de ambiente não encontrado: ${arquivo_env}" >&2
  echo "Gere com: bash infra/scripts/gerar-env.sh" >&2
  exit 1
fi

exec docker compose \
  -f "${raiz}/infra/compose/docker-compose.yml" \
  -f "${raiz}/infra/compose/docker-compose.publico.yml" \
  --env-file "$arquivo_env" \
  "$@"
