#!/usr/bin/env bash
# =============================================================================
# CHIRON | Preparação de uma VM Ubuntu nova para a pilha pública
#
# Feito para a VM Ampere A1 (ARM) do Oracle Cloud Always Free com a imagem
# Canonical Ubuntu 24.04, e serve para qualquer Ubuntu 24.04 com IP público.
# Roda uma vez, logo depois do primeiro SSH, e pode rodar de novo sem estragar
# nada (cada passo confere antes de agir).
#
#   # no seu computador, a partir da raiz do repositório:
#   scp infra/scripts/bootstrap-vm.sh ubuntu@<IP-DA-VM>:
#   # na VM:
#   sudo bash bootstrap-vm.sh
#
# Se o repositório já estiver clonado na VM, rode a cópia dele:
#   sudo bash /opt/chiron/infra/scripts/bootstrap-vm.sh
#
# O que faz:
#   1. atualiza o sistema e instala git, curl, openssl, age, rclone, cron,
#      postgresql-client-16 (pg_dump do backup) e unattended-upgrades;
#   2. libera TCP 80 e 443 (e UDP 443, HTTP/3) no iptables da imagem da
#      Oracle, de forma persistente, sem tocar no resto das regras;
#   3. cria swap (padrão 4 GB) se a máquina não tiver;
#   4. instala Docker Engine e o plugin compose pelo repositório oficial;
#   5. coloca o usuário no grupo docker;
#   6. cria a chave de implantação (deploy key) só de leitura e clona o
#      repositório em /opt/chiron, se ainda não estiver lá;
#   7. prepara o arquivo de log do backup, com rotação.
#
# Variáveis opcionais:
#   CHIRON_REPO    repositório (padrão git@github.com:vctrmaia1412/Chiron.git;
#                  repositório público pode usar a URL https)
#   CHIRON_BRANCH  ramo a clonar (padrão main)
#   CHIRON_DIR     destino (padrão /opt/chiron)
#   CHIRON_USER    dono dos arquivos e do grupo docker (padrão: quem chamou o
#                  sudo; na Oracle, ubuntu)
#   SWAP_GB        tamanho da swap em GB (padrão 4; 0 não cria)
# =============================================================================
set -euo pipefail

CHIRON_REPO="${CHIRON_REPO:-git@github.com:vctrmaia1412/Chiron.git}"
CHIRON_BRANCH="${CHIRON_BRANCH:-main}"
CHIRON_DIR="${CHIRON_DIR:-/opt/chiron}"
CHIRON_USER="${CHIRON_USER:-${SUDO_USER:-}}"
SWAP_GB="${SWAP_GB:-4}"

# Impressão digital publicada pelo GitHub para a chave ed25519 do github.com
# (docs.github.com, "GitHub's SSH key fingerprints"). Conferida antes de
# confiar no host, em vez de aceitar o que a rede devolver.
GITHUB_ED25519_FP="SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU"

passo() { printf '\n==> %s\n' "$*"; }
aviso() { printf 'Aviso: %s\n' "$*" >&2; }
falha() {
  printf 'Erro: %s\n' "$*" >&2
  exit 1
}

# ------------------------------------------------------------ pré-condições
[ "$(id -u)" -eq 0 ] || falha "rode com sudo: sudo bash $0"
[ -n "$CHIRON_USER" ] && [ "$CHIRON_USER" != "root" ] ||
  falha "não descobri o usuário comum. Rode com sudo a partir do usuário ubuntu, ou defina CHIRON_USER."
id "$CHIRON_USER" > /dev/null 2>&1 || falha "o usuário ${CHIRON_USER} não existe."
casa_usuario="$(getent passwd "$CHIRON_USER" | cut -d: -f6)"
grupo_usuario="$(id -gn "$CHIRON_USER")"

# Onde este arquivo está, antes de trocar de diretório: decide se ainda é
# preciso clonar o repositório.
origem_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Comandos rodados como o usuário comum não podem herdar um diretório que ele
# não lê (por exemplo, /root).
cd "$casa_usuario"

[ -r /etc/os-release ] || falha "sistema sem /etc/os-release; este script é para Ubuntu."
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || falha "este script é para Ubuntu (encontrei ${ID:-desconhecido}). Na Oracle, escolha a imagem Canonical Ubuntu 24.04."
codinome="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
[ "${VERSION_ID:-}" = "24.04" ] || aviso "testado em Ubuntu 24.04; esta máquina é ${VERSION_ID:-?}. Seguindo assim mesmo."

export DEBIAN_FRONTEND=noninteractive
como_usuario() { sudo -u "$CHIRON_USER" -H "$@"; }

# ------------------------------------------------------------------ pacotes
passo "1/7 Atualizando o sistema e instalando ferramentas"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade
apt-get install -y -q ca-certificates curl gnupg git openssl cron age rclone \
  unattended-upgrades logrotate

# pg_dump precisa ser da mesma versão principal do servidor (postgres:16) ou
# mais nova. O Ubuntu 24.04 já traz a 16; em outra versão, usa o repositório
# oficial do PostgreSQL (PGDG).
if ! dpkg -s postgresql-client-16 > /dev/null 2>&1; then
  if ! apt-get install -y -q postgresql-client-16; then
    aviso "postgresql-client-16 não está no repositório do Ubuntu; adicionando o PGDG."
    apt-get install -y -q postgresql-common
    /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
    apt-get install -y -q postgresql-client-16
  fi
fi
systemctl enable --now cron > /dev/null 2>&1 || true
systemctl enable --now unattended-upgrades > /dev/null 2>&1 || true

# ----------------------------------------------------------------- firewall
passo "2/7 Liberando 80 e 443 no firewall do sistema"
# As imagens Ubuntu da Oracle vêm com iptables próprio: tudo que não está
# liberado cai num REJECT no fim da cadeia INPUT. A Oracle desaconselha o UFW
# nessas imagens, então a regra entra direto no iptables e no
# /etc/iptables/rules.v4, logo antes do REJECT. O arquivo é editado em vez de
# usar `netfilter-persistent save`, que gravaria junto as regras dinâmicas do
# Docker e as ressuscitaria velhas no próximo boot.
regras_arquivo=/etc/iptables/rules.v4

liberar_porta() {
  local proto="$1" porta="$2" regra posicao
  regra="-p ${proto} -m state --state NEW -m ${proto} --dport ${porta} -j ACCEPT"

  # shellcheck disable=SC2086 # a regra é uma lista de argumentos de propósito
  if ! iptables -C INPUT $regra 2> /dev/null; then
    posicao="$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')"
    if [ -n "$posicao" ]; then
      # shellcheck disable=SC2086
      iptables -I INPUT "$posicao" $regra
    else
      # shellcheck disable=SC2086
      iptables -A INPUT $regra
    fi
    echo "      ${proto}/${porta} liberada agora."
  else
    echo "      ${proto}/${porta} já estava liberada."
  fi

  if [ -f "$regras_arquivo" ] && ! grep -qF -- "-A INPUT ${regra}" "$regras_arquivo"; then
    if grep -q '^-A INPUT -j REJECT' "$regras_arquivo"; then
      sed -i "0,/^-A INPUT -j REJECT/s//-A INPUT ${regra}\n&/" "$regras_arquivo"
    else
      aviso "não achei o REJECT em ${regras_arquivo}; a regra de ${proto}/${porta} vale só até o próximo boot."
    fi
  fi
}

if command -v iptables > /dev/null 2>&1; then
  liberar_porta tcp 80
  liberar_porta tcp 443
  liberar_porta udp 443
else
  aviso "iptables ausente; confira o firewall desta máquina por conta própria."
fi

if command -v ufw > /dev/null 2>&1 && ufw status 2> /dev/null | grep -q '^Status: active'; then
  ufw allow 80/tcp > /dev/null
  ufw allow 443/tcp > /dev/null
  ufw allow 443/udp > /dev/null
  echo "      UFW ativo: 80/tcp, 443/tcp e 443/udp liberadas nele também."
fi
echo "      Lembrete: a lista de segurança da VCN (painel da Oracle) também precisa liberar 80 e 443."

# --------------------------------------------------------------------- swap
passo "3/7 Swap"
if [ "$SWAP_GB" -gt 0 ] && [ -z "$(swapon --show --noheadings 2> /dev/null)" ]; then
  if [ ! -f /swapfile ]; then
    fallocate -l "${SWAP_GB}G" /swapfile 2> /dev/null ||
      dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024)) status=none
    chmod 600 /swapfile
    mkswap /swapfile > /dev/null
  fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Swap como colchão para o build do Next.js e picos, não como memória.
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-chiron.conf
  sysctl -q -p /etc/sysctl.d/99-chiron.conf
  echo "      Swap de ${SWAP_GB} GB criada."
else
  echo "      Nada a fazer (swap já existe ou SWAP_GB=0)."
fi

# ------------------------------------------------------------------- docker
passo "4/7 Docker Engine e compose"
if ! command -v docker > /dev/null 2>&1 || ! docker compose version > /dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codinome} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker > /dev/null
docker --version
docker compose version

passo "5/7 Grupo docker"
if id -nG "$CHIRON_USER" | tr ' ' '\n' | grep -qx docker; then
  echo "      ${CHIRON_USER} já está no grupo docker."
else
  usermod -aG docker "$CHIRON_USER"
  echo "      ${CHIRON_USER} entrou no grupo docker (vale a partir do próximo login SSH)."
fi

# --------------------------------------------------------------- repositório
passo "6/7 Repositório em ${CHIRON_DIR}"

if [ -e "${CHIRON_DIR}/.git" ]; then
  echo "      Já clonado. Para atualizar: cd ${CHIRON_DIR} && git pull"
elif [ -f "${origem_script}/../../infra/compose/docker-compose.yml" ] && [ -e "${origem_script}/../../.git" ]; then
  echo "      Rodando de dentro de um clone em $(cd "${origem_script}/../.." && pwd); nada a clonar."
else
  case "$CHIRON_REPO" in
    git@github.com:* | ssh://git@github.com/*)
      chave="${casa_usuario}/.ssh/chiron_deploy"
      como_usuario mkdir -p "${casa_usuario}/.ssh"
      chmod 700 "${casa_usuario}/.ssh"

      if [ ! -f "$chave" ]; then
        como_usuario ssh-keygen -q -t ed25519 -N "" -C "chiron-deploy@$(hostname)" -f "$chave"
      fi

      # Host do GitHub conferido pela impressão digital publicada.
      hosts_conhecidos="${casa_usuario}/.ssh/known_hosts"
      if ! como_usuario ssh-keygen -F github.com > /dev/null 2>&1; then
        chave_host="$(ssh-keyscan -t ed25519 github.com 2> /dev/null)"
        fp_obtida="$(printf '%s\n' "$chave_host" | ssh-keygen -lf - | awk '{print $2}')"
        [ "$fp_obtida" = "$GITHUB_ED25519_FP" ] ||
          falha "a chave do github.com não confere (${fp_obtida:-vazia}). Rede suspeita; não continue."
        printf '%s\n' "$chave_host" >> "$hosts_conhecidos"
        chown "${CHIRON_USER}:${grupo_usuario}" "$hosts_conhecidos"
        chmod 644 "$hosts_conhecidos"
      fi

      config_ssh="${casa_usuario}/.ssh/config"
      if ! grep -qs 'chiron_deploy' "$config_ssh"; then
        printf 'Host github.com\n  IdentityFile %s\n  IdentitiesOnly yes\n' "$chave" >> "$config_ssh"
        chown "${CHIRON_USER}:${grupo_usuario}" "$config_ssh"
        chmod 600 "$config_ssh"
      fi

      if ! como_usuario git ls-remote --heads "$CHIRON_REPO" > /dev/null 2>&1; then
        echo
        echo "      Cadastre esta chave como Deploy key SÓ DE LEITURA do repositório:"
        echo "      GitHub > repositório > Settings > Deploy keys > Add deploy key"
        echo "      (não marque 'Allow write access')"
        echo
        cat "${chave}.pub"
        echo
        if [ -t 0 ]; then
          read -r -p "      Pressione Enter depois de salvar a chave no GitHub... " _
        else
          falha "sem terminal para esperar. Cadastre a chave acima e rode o script de novo."
        fi
        como_usuario git ls-remote --heads "$CHIRON_REPO" > /dev/null ||
          falha "o GitHub ainda recusa a chave. Confira o cadastro e rode o script de novo."
      fi
      ;;
  esac

  install -d -o "$CHIRON_USER" -g "$grupo_usuario" -m 0755 "$CHIRON_DIR"
  como_usuario git clone --branch "$CHIRON_BRANCH" "$CHIRON_REPO" "$CHIRON_DIR"
  echo "      Clonado em ${CHIRON_DIR}."
fi

# --------------------------------------------------------------- log backup
passo "7/7 Log do backup"
touch /var/log/chiron-backup.log
chown "${CHIRON_USER}:${grupo_usuario}" /var/log/chiron-backup.log
chmod 640 /var/log/chiron-backup.log
cat > /etc/logrotate.d/chiron-backup << EOF
/var/log/chiron-backup.log {
  monthly
  rotate 12
  compress
  missingok
  notifempty
  create 0640 ${CHIRON_USER} ${grupo_usuario}
}
EOF
echo "      /var/log/chiron-backup.log pronto, com rotação mensal."

# ----------------------------------------------------------------- próximos
if [ -f /var/run/reboot-required ]; then
  echo
  echo "A atualização pede reinício (kernel novo). Depois deste script: sudo reboot"
fi

cat << EOF

VM pronta. Próximos passos (docs/DEPLOY_GRATUITO.md, seção 6 em diante):

  1. Saia do SSH e entre de novo, para o grupo docker valer.
  2. Confira se o domínio já aponta para o IP público desta VM.
  3. cd ${CHIRON_DIR}
     bash infra/scripts/gerar-env.sh
  4. bash infra/scripts/dc.sh up -d --build
EOF
