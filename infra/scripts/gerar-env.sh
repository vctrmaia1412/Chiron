#!/usr/bin/env bash
# =============================================================================
# CHIRON | Gera o .env.stack de um servidor público, com segredos novos
#
#   bash infra/scripts/gerar-env.sh            # produção ou piloto
#   bash infra/scripts/gerar-env.sh --demo     # demonstração (seed liberado)
#
# Pergunta o domínio, o e-mail do Let's Encrypt e, se houver, a chave do
# Resend. Para rodar sem perguntas, defina antes as variáveis de mesmo nome:
#   CHIRON_DOMAIN  ACME_EMAIL  EMAIL_API_KEY  EMAIL_FROM
#
# Opções:
#   --demo         ambiente de demonstração: APP_ENV=homolog e senha HTTP na
#                  porta (Caddyfile.demo), porque o seed usa senha conhecida
#   --saida ARQ    grava em ARQ em vez de <raiz do repositório>/.env.stack
#   --forcar       sobrescreve um arquivo existente, guardando o antigo ao lado
#
# Modo resultante:
#   com chave do Resend -> APP_ENV=prod, produção de verdade
#   sem chave           -> APP_ENV=homolog, "piloto sem e-mail": o link de
#                          convite e o de redefinição de senha saem no log da
#                          API em vez de chegar por e-mail
#   --demo              -> APP_ENV=homolog com senha na porta
#
# Os segredos saem de `openssl rand -hex`: só [0-9a-f], então cabem em URL de
# conexão sem escape e não quebram o parser do .env.
#
# NÃO rode de novo depois do primeiro boot: a senha do Postgres fica gravada
# no volume, a dos papéis é aplicada uma vez pela migração 0005, e trocar
# COLUMN_ENCRYPTION_KEY deixa CPF e CNPJ gravados ilegíveis.
# =============================================================================
set -euo pipefail

# O arquivo tem todos os segredos: só o dono lê.
umask 077

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
saida="${raiz}/.env.stack"
modo_demo=0
forcar=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --demo) modo_demo=1 ;;
    --forcar) forcar=1 ;;
    --saida)
      [ "$#" -ge 2 ] || { echo "--saida precisa de um caminho." >&2; exit 1; }
      saida="$2"
      shift
      ;;
    -h | --help | --ajuda)
      sed -n '2,32p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $1 (use --ajuda)." >&2
      exit 1
      ;;
  esac
  shift
done

command -v openssl > /dev/null 2>&1 || {
  echo "openssl não está instalado. Na VM: sudo apt-get install -y openssl" >&2
  exit 1
}

# --------------------------------------------------------------- funções
segredo() { openssl rand -hex "${1:-32}"; }

interativo() { [ -t 0 ]; }

# perguntar NOME_DA_VARIAVEL "texto" [padrão]
# Usa o valor já definido no ambiente; senão pergunta (terminal) ou usa o
# padrão (sem terminal). Sem valor nenhum, deixa vazio.
perguntar() {
  local nome="$1" texto="$2" padrao="${3:-}" valor
  valor="${!nome:-}"
  if [ -z "$valor" ] && interativo; then
    if [ -n "$padrao" ]; then
      read -r -p "${texto} [${padrao}]: " valor
    else
      read -r -p "${texto}: " valor
    fi
  fi
  [ -n "$valor" ] || valor="$padrao"
  printf -v "$nome" '%s' "$valor"
}

# ------------------------------------------------------- arquivo existente
if [ -e "$saida" ]; then
  if [ "$forcar" -ne 1 ]; then
    echo "Já existe ${saida}. Nada foi alterado." >&2
    echo "Se a pilha já subiu com ele, NÃO regenere: o banco e os dados cifrados dependem destes segredos." >&2
    echo "Para sobrescrever mesmo assim (instalação nova, volumes apagados): --forcar" >&2
    exit 1
  fi
  copia="${saida}.antigo-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$saida" "$copia"
  echo "Arquivo anterior guardado em ${copia}."
fi

# ----------------------------------------------------------------- domínio
perguntar CHIRON_DOMAIN "Domínio público (ex.: chiron-piloto.duckdns.org)"
CHIRON_DOMAIN="$(printf '%s' "$CHIRON_DOMAIN" | tr '[:upper:]' '[:lower:]' | sed -E 's#^https?://##; s#/.*$##')"

if ! printf '%s' "$CHIRON_DOMAIN" | grep -Eq '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$'; then
  echo "Domínio inválido: '${CHIRON_DOMAIN}'. Use um nome como chiron-piloto.duckdns.org (IP puro não recebe certificado)." >&2
  exit 1
fi
case "$CHIRON_DOMAIN" in
  localhost | *.localhost | *.local)
    echo "Domínio local não serve: o Let's Encrypt precisa alcançar o nome pela internet." >&2
    exit 1
    ;;
esac

perguntar ACME_EMAIL "E-mail para avisos do certificado (Let's Encrypt)"
if ! printf '%s' "$ACME_EMAIL" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'; then
  echo "E-mail inválido: '${ACME_EMAIL}'." >&2
  exit 1
fi

# ------------------------------------------------------------------ e-mail
EMAIL_API_KEY="${EMAIL_API_KEY:-}"
if [ "$modo_demo" -eq 1 ]; then
  # Demonstração não envia e-mail: os acessos já vêm prontos do seed.
  EMAIL_API_KEY=""
else
  if [ -z "$EMAIL_API_KEY" ] && interativo; then
    echo
    echo "E-mail transacional (convite e redefinição de senha) usa o Resend."
    echo "Exige um domínio com DNS editável e verificado no Resend. Sem chave,"
    echo "o servidor sobe em modo piloto: os links aparecem no log da API."
    read -r -p "Chave da API do Resend (Enter para pular): " EMAIL_API_KEY
  fi
fi

if [ -n "$EMAIL_API_KEY" ]; then
  case "$EMAIL_API_KEY" in
    re_*) ;;
    *) echo "Aviso: chaves do Resend costumam começar com 're_'. Confira se colou a chave certa." >&2 ;;
  esac
  perguntar EMAIL_FROM "Remetente (domínio verificado no Resend)" "CHIRON <nao-responda@${CHIRON_DOMAIN}>"
  case "$EMAIL_FROM" in
    *chiron.local*)
      echo "EMAIL_FROM precisa ser de um domínio verificado no Resend, não chiron.local." >&2
      exit 1
      ;;
    *'"'*)
      echo "EMAIL_FROM não pode conter aspas duplas." >&2
      exit 1
      ;;
  esac
  email_provider="resend"
else
  EMAIL_FROM="CHIRON <nao-responda@chiron.local>"
  email_provider="none"
fi

# -------------------------------------------------------------------- modo
if [ "$modo_demo" -eq 1 ]; then
  app_env="homolog"
  descricao_modo="demonstração (APP_ENV=homolog, senha na porta, seed liberado)"
  caddyfile="Caddyfile.demo"
elif [ "$email_provider" = "resend" ]; then
  app_env="prod"
  descricao_modo="produção (APP_ENV=prod, e-mail pelo Resend)"
  caddyfile="Caddyfile.publico"
else
  app_env="homolog"
  descricao_modo="piloto sem e-mail (APP_ENV=homolog, links de convite no log da API)"
  caddyfile="Caddyfile.publico"
fi

# ------------------------------------------------- senha de porta da demo
demo_usuario="demo"
demo_senha=""
demo_hash=""
if [ "$modo_demo" -eq 1 ]; then
  command -v docker > /dev/null 2>&1 || {
    echo "O modo --demo usa o Docker para gerar o hash da senha. Rode depois do bootstrap-vm.sh." >&2
    exit 1
  }
  demo_senha="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-20)"
  # Senha pela entrada padrão: não aparece na lista de processos.
  if ! demo_hash="$(printf '%s\n' "$demo_senha" | docker run --rm -i caddy:2-alpine caddy hash-password)"; then
    echo "Não foi possível gerar o hash com o Docker." >&2
    echo "Se acabou de rodar o bootstrap-vm.sh, saia do SSH e entre de novo (grupo docker) e repita." >&2
    exit 1
  fi
  # Prefixo literal do bcrypt ($2a$, $2b$...), não uma expansão.
  # shellcheck disable=SC2016
  case "$demo_hash" in
    '$2'*) ;;
    *)
      echo "Hash inesperado do caddy hash-password: ${demo_hash}" >&2
      exit 1
      ;;
  esac
fi

# --------------------------------------------------------------- gravação
gerado_em="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
temporario="$(mktemp "${saida}.XXXXXX")"
trap 'rm -f "$temporario"' EXIT

cat > "$temporario" << EOF
# =============================================================================
# CHIRON | .env.stack de servidor público
# Gerado por infra/scripts/gerar-env.sh em ${gerado_em}
# Modo: ${descricao_modo}
#
# NÃO versionar. NÃO regenerar depois do primeiro boot.
# Copie este arquivo INTEIRO para o seu gerenciador de senhas agora. Sem
# COLUMN_ENCRYPTION_KEY, CPF e CNPJ gravados (inclusive nos backups) ficam
# irrecuperáveis; sem POSTGRES_PASSWORD, nenhum backup é restaurado.
# =============================================================================

# ------------------------------------------------------------------ modo
APP_ENV=${app_env}
LOG_LEVEL=info

# ------------------------------------------------------- endereço público
CHIRON_DOMAIN=${CHIRON_DOMAIN}
STACK_PUBLIC_URL=https://${CHIRON_DOMAIN}
ACME_EMAIL=${ACME_EMAIL}
COOKIE_SECURE=true
PROXY_CADDYFILE=${caddyfile}
# Porta de conferência, publicada só no 127.0.0.1 da VM.
PROXY_PORT=8080

# ------------------------------------------------------------------ banco
# Senha do chiron_owner (superusuário do Postgres da pilha).
POSTGRES_PASSWORD=$(segredo 24)
# Senha de chiron_app, chiron_iam e chiron_admin, aplicada pela migração.
DATABASE_ROLE_PASSWORD=$(segredo 24)

# ----------------------------------------------------------- aplicação
SESSION_SECRET=$(segredo 32)
COLUMN_ENCRYPTION_KEY=$(segredo 32)
COLUMN_HASH_KEY=$(segredo 32)

# --------------------------------------- documentos (MinIO na própria VM)
# O bucket aparece na URL pública: https://${CHIRON_DOMAIN}/chiron-arquivos/...
S3_BUCKET=chiron-arquivos
S3_ACCESS_KEY=chiron$(segredo 8)
S3_SECRET_KEY=$(segredo 32)

# ------------------------------------------------------------------ e-mail
EMAIL_PROVIDER=${email_provider}
EMAIL_API_KEY=${EMAIL_API_KEY}
EMAIL_FROM="${EMAIL_FROM}"

# ------------------------------------------------------------------ redis
# O Redis não sobe na pilha pública, mas o arquivo principal exige a senha.
REDIS_PASSWORD=$(segredo 24)

# ---------------------------------------------- demonstração (Caddyfile.demo)
DEMO_USUARIO=${demo_usuario}
# Aspas simples: o hash bcrypt tem \$ e não pode ser interpolado.
DEMO_SENHA_HASH='${demo_hash}'
EOF

chmod 600 "$temporario"
mv "$temporario" "$saida"
trap - EXIT

# ---------------------------------------------------------------- resumo
echo
echo "Gerado: ${saida} (permissão 600)"
echo "Modo:   ${descricao_modo}"
echo "URL:    https://${CHIRON_DOMAIN}"

ip_resolvido="$(getent hosts "$CHIRON_DOMAIN" 2> /dev/null | awk '{print $1; exit}' || true)"
if [ -n "$ip_resolvido" ]; then
  echo "DNS:    ${CHIRON_DOMAIN} aponta para ${ip_resolvido}. Confira se é o IP público desta VM."
else
  echo "DNS:    ${CHIRON_DOMAIN} ainda não resolve. Sem isso o certificado não sai."
fi

if [ "$modo_demo" -eq 1 ]; then
  echo
  echo "Senha de porta da demonstração (aparece só agora, guarde):"
  echo "  usuário: ${demo_usuario}"
  echo "  senha:   ${demo_senha}"
fi

if [ "$app_env" = "homolog" ] && [ "$modo_demo" -ne 1 ]; then
  echo
  echo "Modo piloto sem e-mail: convites e redefinições de senha ficam no log da API."
  echo "  bash infra/scripts/dc.sh logs api | grep 'modo seco'"
fi

echo
echo "Próximo passo: copie o conteúdo do arquivo para o gerenciador de senhas"
echo "  cat ${saida}"
echo "e suba a pilha:"
echo "  bash infra/scripts/dc.sh up -d --build"
