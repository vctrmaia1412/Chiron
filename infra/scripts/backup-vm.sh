#!/usr/bin/env bash
# =============================================================================
# CHIRON | Backup diário da VM pública (pilha do docker-compose.publico.yml)
#
#   bash infra/scripts/backup-vm.sh             # roda um backup agora
#   bash infra/scripts/backup-vm.sh --agendar   # instala no crontab do usuário
#
# Não reimplementa nada: carrega a configuração e chama o
# infra/scripts/backup.sh, que faz o pg_dump, cifra com age, envia para o
# destino, guarda o mensal, espelha os documentos e aplica a retenção.
#
# De onde vem cada coisa:
#   .env.stack   senha do chiron_owner e credencial do MinIO (gerar-env.sh)
#   .env.backup  destino rclone, chave pública age, heartbeat
#                (modelo em infra/scripts/backup.env.exemplo)
# O Postgres e o MinIO são alcançados pelo 127.0.0.1, onde a sobreposição
# pública publica as portas só para a própria VM.
#
# Horário do agendamento: 06:10 UTC, que é 03:10 em Brasília, fora do
# expediente de qualquer clínica. A VM da Oracle roda em UTC.
# =============================================================================
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_stack="${CHIRON_ENV_FILE:-${raiz}/.env.stack}"
env_backup="${CHIRON_BACKUP_ENV_FILE:-${raiz}/.env.backup}"
log_backup="${CHIRON_BACKUP_LOG:-/var/log/chiron-backup.log}"

if [ "${1:-}" = "--agendar" ]; then
  linha="10 6 * * * bash ${raiz}/infra/scripts/backup-vm.sh >> ${log_backup} 2>&1"
  if crontab -l 2> /dev/null | grep -qF "infra/scripts/backup-vm.sh"; then
    echo "Já agendado no crontab de $(id -un):"
    crontab -l | grep -F "infra/scripts/backup-vm.sh"
  else
    { crontab -l 2> /dev/null || true; echo "$linha"; } | crontab -
    echo "Agendado no crontab de $(id -un): ${linha}"
  fi
  exit 0
fi

for arquivo in "$env_stack" "$env_backup"; do
  if [ ! -f "$arquivo" ]; then
    echo "Backup abortado: falta ${arquivo}." >&2
    [ "$arquivo" = "$env_backup" ] &&
      echo "Crie a partir do modelo: cp infra/scripts/backup.env.exemplo .env.backup && chmod 600 .env.backup" >&2
    exit 1
  fi
done

# Os dois arquivos são KEY=valor com aspas quando preciso: o bash lê direto.
set -a
# shellcheck disable=SC1090
. "$env_stack"
# shellcheck disable=SC1090
. "$env_backup"
set +a

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD ausente no .env.stack}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY ausente no .env.stack}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY ausente no .env.stack}"

# O chiron_owner é superusuário na pilha em contêiner: o pg_dump atravessa o
# FORCE ROW LEVEL SECURITY sem sair pela metade.
export BACKUP_DATABASE_URL="${BACKUP_DATABASE_URL:-postgres://chiron_owner:${POSTGRES_PASSWORD}@127.0.0.1:5432/chiron}"

# MinIO local como remoto do rclone, declarado por variável de ambiente (o
# nome do remoto é chironminio), sem arquivo rclone.conf com segredo.
export RCLONE_CONFIG_CHIRONMINIO_TYPE=s3
export RCLONE_CONFIG_CHIRONMINIO_PROVIDER=Minio
export RCLONE_CONFIG_CHIRONMINIO_ENDPOINT=http://127.0.0.1:9000
export RCLONE_CONFIG_CHIRONMINIO_ACCESS_KEY_ID="$S3_ACCESS_KEY"
export RCLONE_CONFIG_CHIRONMINIO_SECRET_ACCESS_KEY="$S3_SECRET_KEY"

bucket="${S3_BUCKET:-chiron}"
if [ -z "${BACKUP_DOCUMENTS_SOURCE:-}" ]; then
  # A API cria o bucket no primeiro upload. Antes disso o espelho falharia
  # com "diretório não encontrado" e derrubaria o backup do banco junto.
  rclone mkdir "chironminio:${bucket}"
  export BACKUP_DOCUMENTS_SOURCE="chironminio:${bucket}"
fi

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) backup da VM ($(hostname))"
exec bash "${raiz}/infra/scripts/backup.sh"
