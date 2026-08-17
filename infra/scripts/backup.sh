#!/usr/bin/env bash
# =============================================================================
# CHIRON | Backup diário do banco e dos documentos
#
# pg_dump -Fc, cifra com age, envia para armazenamento compatível com S3
# (rclone ou aws cli), espelha o bucket de documentos, aplica a retenção de
# 30 diários e 12 mensais e avisa o monitor externo no fim.
#
# Prontuário tem guarda obrigatória de cinco anos, então backup que não roda
# precisa aparecer: o heartbeat é a última linha do script, disparada só
# depois de tudo dar certo. Monitor sem ping no horário significa incidente.
#
# Nenhuma credencial mora aqui. Tudo vem do ambiente.
#
#   Obrigatórias
#     BACKUP_DATABASE_URL     conexão do dump (na falta, usa DATABASE_MIGRATION_URL)
#     BACKUP_AGE_PUBLIC_KEY   chave pública age; aceita várias separadas por espaço
#     BACKUP_REMOTE           destino: "r2:chiron-backup/prod" (rclone) ou
#                             "s3://chiron-backup/prod" (aws cli)
#   Opcionais
#     BACKUP_DOCUMENTS_SOURCE origem do bucket de documentos para o espelho
#     BACKUP_HEARTBEAT_URL    ping de fim de execução no monitor externo
#     BACKUP_TOOL             auto (padrão), rclone ou aws
#     BACKUP_S3_ENDPOINT      endpoint S3 alternativo, usado só com o aws cli
#     BACKUP_KEEP_DAILY       padrão 30
#     BACKUP_KEEP_MONTHLY     padrão 12
#     BACKUP_WORK_DIR         diretório do arquivo temporário, padrão /tmp
#     BACKUP_PREFIX           prefixo do nome do arquivo, padrão chiron
#
# Cron sugerido, fora do horário da clínica:
#   10 3 * * * /opt/chiron/infra/scripts/backup.sh >> /var/log/chiron-backup.log 2>&1
# =============================================================================
set -euo pipefail

# O dump tem prontuário: nada de arquivo temporário legível por outro usuário.
umask 077

BACKUP_DATABASE_URL="${BACKUP_DATABASE_URL:-${DATABASE_MIGRATION_URL:-}}"
BACKUP_AGE_PUBLIC_KEY="${BACKUP_AGE_PUBLIC_KEY:-}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
BACKUP_DOCUMENTS_SOURCE="${BACKUP_DOCUMENTS_SOURCE:-}"
BACKUP_HEARTBEAT_URL="${BACKUP_HEARTBEAT_URL:-}"
BACKUP_TOOL="${BACKUP_TOOL:-auto}"
BACKUP_S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
BACKUP_KEEP_DAILY="${BACKUP_KEEP_DAILY:-30}"
BACKUP_KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-12}"
BACKUP_WORK_DIR="${BACKUP_WORK_DIR:-/tmp}"
BACKUP_PREFIX="${BACKUP_PREFIX:-chiron}"

# --------------------------------------------------------------- validação
faltando=()
[ -n "$BACKUP_DATABASE_URL" ] || faltando+=("BACKUP_DATABASE_URL (ou DATABASE_MIGRATION_URL)")
[ -n "$BACKUP_AGE_PUBLIC_KEY" ] || faltando+=("BACKUP_AGE_PUBLIC_KEY")
[ -n "$BACKUP_REMOTE" ] || faltando+=("BACKUP_REMOTE")

if [ "${#faltando[@]}" -gt 0 ]; then
  echo "Backup abortado: faltam variáveis obrigatórias." >&2
  for variavel in "${faltando[@]}"; do echo "  - $variavel" >&2; done
  exit 1
fi

if [ "$BACKUP_TOOL" = "auto" ]; then
  case "$BACKUP_REMOTE" in
    s3://*) BACKUP_TOOL="aws" ;;
    *:*) BACKUP_TOOL="rclone" ;;
    *)
      echo "Backup abortado: BACKUP_REMOTE deve ser s3://bucket/prefixo ou remoto:bucket/prefixo do rclone." >&2
      exit 1
      ;;
  esac
fi

exigir_binario() {
  command -v "$1" > /dev/null 2>&1 || {
    echo "Backup abortado: $1 não está instalado neste servidor." >&2
    exit 1
  }
}

exigir_binario pg_dump
exigir_binario pg_restore
exigir_binario age
exigir_binario "$BACKUP_TOOL"
[ -z "$BACKUP_HEARTBEAT_URL" ] || exigir_binario curl

# ----------------------------------------------------------- destino remoto
aws_cli() {
  if [ -n "$BACKUP_S3_ENDPOINT" ]; then
    aws --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"
  else
    aws "$@"
  fi
}

remoto_enviar() {
  local origem="$1"
  local destino="${BACKUP_REMOTE%/}/$2"
  case "$BACKUP_TOOL" in
    rclone) rclone copyto "$origem" "$destino" ;;
    aws) aws_cli s3 cp "$origem" "$destino" ;;
  esac
}

remoto_listar() {
  local pasta="${BACKUP_REMOTE%/}/$1/"
  case "$BACKUP_TOOL" in
    rclone) rclone lsf "$pasta" 2> /dev/null || true ;;
    aws) aws_cli s3 ls "$pasta" 2> /dev/null | awk '{print $4}' || true ;;
  esac
}

remoto_apagar() {
  local alvo="${BACKUP_REMOTE%/}/$1"
  case "$BACKUP_TOOL" in
    rclone) rclone deletefile "$alvo" ;;
    aws) aws_cli s3 rm "$alvo" ;;
  esac
}

# Espelho de verdade: documento apagado por pedido de titular também some da
# cópia, senão o backup vira uma segunda base fora de controle.
remoto_espelhar() {
  local origem="$1"
  local destino="${BACKUP_REMOTE%/}/$2"
  case "$BACKUP_TOOL" in
    rclone) rclone sync "$origem" "$destino" ;;
    aws) aws_cli s3 sync --delete "$origem" "$destino" ;;
  esac
}

aplicar_retencao() {
  local pasta="$1"
  local manter="$2"
  local lista total excedente arquivo
  # Nome com carimbo ISO em UTC: ordem alfabética é ordem cronológica.
  lista="$(remoto_listar "$pasta" | grep -E '\.dump\.age$' | sort || true)"
  [ -n "$lista" ] || return 0

  total="$(printf '%s\n' "$lista" | wc -l | tr -d ' ')"
  excedente=$((total - manter))
  [ "$excedente" -gt 0 ] || return 0

  echo "Retenção em ${pasta}: removendo ${excedente} arquivo(s), mantendo os ${manter} mais recentes."
  printf '%s\n' "$lista" | head -n "$excedente" | while IFS= read -r arquivo; do
    [ -n "$arquivo" ] || continue
    remoto_apagar "${pasta}/${arquivo}"
  done
}

# ------------------------------------------------------------------ execução
inicio="$(date -u +%s)"
carimbo="$(date -u +%Y%m%dT%H%M%SZ)"
competencia="$(date -u +%Y%m)"

trabalho="$(mktemp -d "${BACKUP_WORK_DIR%/}/chiron-backup.XXXXXX")"
trap 'rm -rf "$trabalho"' EXIT

dump="${trabalho}/${BACKUP_PREFIX}-${carimbo}.dump"
cifrado="${dump}.age"
nome="$(basename "$cifrado")"

echo "[1/6] Gerando o dump do banco."
# As tabelas de tenant têm FORCE ROW LEVEL SECURITY, e o pg_dump lê com
# row_security desligado: a conexão precisa ser de um papel superusuário ou
# com BYPASSRLS, senão o dump para com erro em vez de sair pela metade.
pg_dump --format=custom --no-password --file "$dump" "$BACKUP_DATABASE_URL"

# Dump truncado só aparece na hora do desastre se ninguém abrir o sumário aqui.
pg_restore --list "$dump" > /dev/null

echo "[2/6] Cifrando com age."
destinatarios=()
for chave in $BACKUP_AGE_PUBLIC_KEY; do destinatarios+=(-r "$chave"); done
age "${destinatarios[@]}" -o "$cifrado" "$dump"
rm -f "$dump"
echo "      ${nome} com $(du -h "$cifrado" | cut -f1)."

echo "[3/6] Enviando o diário."
remoto_enviar "$cifrado" "diario/${nome}"

echo "[4/6] Conferindo o mensal de ${competencia}."
if remoto_listar mensal | grep -q "^${BACKUP_PREFIX}-${competencia}\.dump\.age$"; then
  echo "      Mensal de ${competencia} já existe."
else
  # O mensal é a primeira cópia bem-sucedida do mês, não a do dia 1: assim uma
  # falha no primeiro dia não deixa o mês sem retenção longa.
  remoto_enviar "$cifrado" "mensal/${BACKUP_PREFIX}-${competencia}.dump.age"
  echo "      Mensal de ${competencia} criado."
fi

echo "[5/6] Espelhando os documentos."
if [ -n "$BACKUP_DOCUMENTS_SOURCE" ]; then
  remoto_espelhar "$BACKUP_DOCUMENTS_SOURCE" "documentos"
else
  echo "      BACKUP_DOCUMENTS_SOURCE não definida: espelho do bucket de documentos ignorado." >&2
fi

echo "[6/6] Aplicando a retenção."
aplicar_retencao diario "$BACKUP_KEEP_DAILY"
aplicar_retencao mensal "$BACKUP_KEEP_MONTHLY"

duracao=$(( $(date -u +%s) - inicio ))
echo "Backup concluído em ${duracao}s: ${nome}."

if [ -n "$BACKUP_HEARTBEAT_URL" ]; then
  if curl -fsS --max-time 15 "$BACKUP_HEARTBEAT_URL" > /dev/null; then
    echo "Heartbeat enviado ao monitor."
  else
    # O backup existe; quem falhou foi o aviso. Sai com erro para o cron
    # reclamar, sem sugerir que o dump não foi feito.
    echo "Aviso: backup concluído, mas o heartbeat não respondeu." >&2
    exit 1
  fi
fi
