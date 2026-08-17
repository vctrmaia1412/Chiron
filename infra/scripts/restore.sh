#!/usr/bin/env bash
# =============================================================================
# CHIRON | Restauração do banco a partir de um dump gerado pelo backup.sh
#
# Decifra o arquivo com age, restaura num PostgreSQL alvo e roda a guarda de
# RLS no fim. A guarda faz parte da restauração, não é um extra: banco
# restaurado sem política de isolamento é vazamento entre clínicas esperando
# acontecer.
#
#   Uso: infra/scripts/restore.sh caminho/chiron-20260817T031000Z.dump.age
#
#   Obrigatórias
#     RESTORE_DATABASE_URL      alvo, com o papel dono (chiron_owner) ou superusuário
#     RESTORE_APP_URL           mesmo banco alvo com o papel chiron_app, usada pela guarda
#   Conforme o caso
#     BACKUP_AGE_IDENTITY_FILE  chave privada age, obrigatória se o arquivo terminar em .age
#     DATABASE_ROLE_PASSWORD    senha aplicada aos papéis que faltarem no alvo
#   Opcionais
#     RESTORE_CLEAN             1 (padrão) derruba os objetos antes de recriar
#     RESTORE_JOBS              paralelismo do pg_restore, padrão 2
#     RLS_GUARD_CMD             comando alternativo da guarda, por exemplo
#                               "docker compose -f infra/compose/docker-compose.yml exec -T api node dist/database/verify-rls.js"
#
# O banco alvo precisa existir antes (createdb). Restaurar por cima do banco de
# produção não é o caminho normal: restaure em um banco novo, confira e só
# então aponte a aplicação.
# =============================================================================
set -euo pipefail

# O dump decifrado tem prontuário: temporário só para o dono do processo.
umask 077

arquivo="${1:-${RESTORE_DUMP:-}}"
RESTORE_DATABASE_URL="${RESTORE_DATABASE_URL:-}"
RESTORE_APP_URL="${RESTORE_APP_URL:-}"
BACKUP_AGE_IDENTITY_FILE="${BACKUP_AGE_IDENTITY_FILE:-}"
DATABASE_ROLE_PASSWORD="${DATABASE_ROLE_PASSWORD:-}"
RESTORE_CLEAN="${RESTORE_CLEAN:-1}"
RESTORE_JOBS="${RESTORE_JOBS:-2}"
RLS_GUARD_CMD="${RLS_GUARD_CMD:-}"

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# --------------------------------------------------------------- validação
faltando=()
[ -n "$arquivo" ] || faltando+=("o arquivo do dump como primeiro argumento (ou RESTORE_DUMP)")
[ -n "$RESTORE_DATABASE_URL" ] || faltando+=("RESTORE_DATABASE_URL")
[ -n "$RESTORE_APP_URL" ] || faltando+=("RESTORE_APP_URL")

if [ "${#faltando[@]}" -gt 0 ]; then
  echo "Restauração abortada: falta informação obrigatória." >&2
  for item in "${faltando[@]}"; do echo "  - $item" >&2; done
  exit 1
fi

[ -f "$arquivo" ] || {
  echo "Restauração abortada: arquivo não encontrado em $arquivo." >&2
  exit 1
}

exigir_binario() {
  command -v "$1" > /dev/null 2>&1 || {
    echo "Restauração abortada: $1 não está instalado neste servidor." >&2
    exit 1
  }
}

exigir_binario pg_restore
exigir_binario psql

case "$arquivo" in
  *.age)
    exigir_binario age
    [ -n "$BACKUP_AGE_IDENTITY_FILE" ] || {
      echo "Restauração abortada: arquivo cifrado exige BACKUP_AGE_IDENTITY_FILE com a chave privada age." >&2
      exit 1
    }
    [ -f "$BACKUP_AGE_IDENTITY_FILE" ] || {
      echo "Restauração abortada: chave privada não encontrada em $BACKUP_AGE_IDENTITY_FILE." >&2
      exit 1
    }
    ;;
esac

trabalho="$(mktemp -d "${TMPDIR:-/tmp}/chiron-restore.XXXXXX")"
trap 'rm -rf "$trabalho"' EXIT

# ------------------------------------------------------------------ decifra
dump="$arquivo"
case "$arquivo" in
  *.age)
    echo "[1/5] Decifrando com age."
    dump="${trabalho}/$(basename "${arquivo%.age}")"
    age --decrypt -i "$BACKUP_AGE_IDENTITY_FILE" -o "$dump" "$arquivo"
    ;;
  *)
    echo "[1/5] Arquivo já em claro, nada a decifrar."
    ;;
esac

# Sumário ilegível é dump corrompido: melhor descobrir antes de tocar no alvo.
pg_restore --list "$dump" > /dev/null

# ------------------------------------------------------------------- papéis
# O dump carrega dono e privilégio por papel. Num cluster novo esses papéis
# ainda não existem e o pg_restore falha objeto a objeto.
echo "[2/5] Conferindo os papéis do banco no alvo."
consulta_papeis="SELECT esperado.nome FROM (VALUES ('chiron_owner'), ('chiron_app'), ('chiron_iam'), ('chiron_admin')) AS esperado(nome) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = esperado.nome)"
papeis_ausentes="$(psql "$RESTORE_DATABASE_URL" -Atq -c "$consulta_papeis")"

if printf '%s\n' "$papeis_ausentes" | grep -qx 'chiron_owner'; then
  echo "Restauração abortada: o papel chiron_owner não existe no alvo." >&2
  echo "Crie o dono antes de restaurar, com a senha que você guarda no cofre:" >&2
  echo "  CREATE ROLE chiron_owner LOGIN PASSWORD ... ;" >&2
  exit 1
fi

if [ -n "$papeis_ausentes" ]; then
  [ -n "$DATABASE_ROLE_PASSWORD" ] || {
    echo "Restauração abortada: faltam papéis no alvo e DATABASE_ROLE_PASSWORD não foi definida." >&2
    printf '%s\n' "$papeis_ausentes" | sed 's/^/  - /' >&2
    exit 1
  }
  echo "      Criando os papéis ausentes com a senha de DATABASE_ROLE_PASSWORD."
  # Mesma senha das URLs de conexão, como faz a migração 0005. Exige
  # superusuário no alvo por causa do BYPASSRLS do chiron_admin.
  psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -v senha="$DATABASE_ROLE_PASSWORD" > /dev/null <<'SQL'
SELECT set_config('chiron.role_password', :'senha', false);
DO $$
DECLARE
  senha text := current_setting('chiron.role_password', true);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chiron_app') THEN
    EXECUTE format('CREATE ROLE chiron_app LOGIN PASSWORD %L NOINHERIT', senha);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chiron_iam') THEN
    EXECUTE format('CREATE ROLE chiron_iam LOGIN PASSWORD %L NOINHERIT', senha);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chiron_admin') THEN
    EXECUTE format('CREATE ROLE chiron_admin LOGIN PASSWORD %L BYPASSRLS NOINHERIT', senha);
  END IF;
END
$$;
SQL
fi

# ---------------------------------------------------------------- restaura
echo "[3/5] Restaurando o dump no alvo."
opcoes=(--dbname "$RESTORE_DATABASE_URL" --no-password --jobs "$RESTORE_JOBS")
[ "$RESTORE_CLEAN" != "1" ] || opcoes+=(--clean --if-exists)

status_restore=0
pg_restore "${opcoes[@]}" "$dump" || status_restore=$?
if [ "$status_restore" -ne 0 ]; then
  echo "Aviso: o pg_restore terminou com código ${status_restore}. Leia os erros acima antes de apontar a aplicação." >&2
fi

echo "[4/5] Atualizando as estatísticas do planejador."
psql "$RESTORE_DATABASE_URL" -Atq -c 'ANALYZE' > /dev/null

# ------------------------------------------------------------ guarda de RLS
echo "[5/5] Guarda de RLS no banco restaurado."
export DATABASE_MIGRATION_URL="$RESTORE_DATABASE_URL"
export DATABASE_URL="$RESTORE_APP_URL"
# A validação de configuração da API exige estes três segredos mesmo quando o
# comando não os usa. A guarda só lê catálogo e conta linhas, então aqui valem
# valores de preenchimento; os de verdade continuam no cofre. Pelo mesmo motivo
# o APP_ENV é rebaixado: as invariantes de produção (cookie, URL pública,
# credencial de storage) não têm nada a ver com verificar RLS e só bloqueariam
# a conferência da restauração.
export APP_ENV=homolog
export SESSION_SECRET="${SESSION_SECRET:-restauracao-guarda-rls-valor-de-preenchimento}"
export COLUMN_ENCRYPTION_KEY="${COLUMN_ENCRYPTION_KEY:-restauracao-guarda-rls-valor-de-preenchimento}"
export COLUMN_HASH_KEY="${COLUMN_HASH_KEY:-restauracao-guarda-rls-valor-de-preenchimento}"

status_guarda=0
if [ -n "$RLS_GUARD_CMD" ]; then
  bash -c "$RLS_GUARD_CMD" || status_guarda=$?
elif command -v pnpm > /dev/null 2>&1 && [ -f "${raiz}/apps/api/src/database/verify-rls.ts" ]; then
  (cd "$raiz" && pnpm --filter @chiron/api exec tsx src/database/verify-rls.ts) || status_guarda=$?
else
  echo "Dados restaurados, mas a guarda de RLS não pôde rodar: pnpm não está disponível aqui." >&2
  echo "Rode a guarda pelo contêiner da API e informe RLS_GUARD_CMD, por exemplo:" >&2
  echo "  docker compose -f infra/compose/docker-compose.yml exec -T api node dist/database/verify-rls.js" >&2
  exit 1
fi

if [ "$status_guarda" -ne 0 ]; then
  echo "Restauração terminou com a guarda de RLS reprovada. Não aponte a aplicação para este banco." >&2
  exit 1
fi

if [ "$status_restore" -ne 0 ]; then
  echo "Restauração terminou com erros do pg_restore, mas a guarda de RLS passou. Revise a saída acima." >&2
  exit 1
fi

echo "Restauração concluída e guarda de RLS aprovada."
