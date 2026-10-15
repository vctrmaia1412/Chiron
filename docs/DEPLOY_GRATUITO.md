# Colocar o CHIRON no ar de graça

Guia para o piloto com 1 a 3 clínicas, do zero até `https://<seu-nome>.duckdns.org`
funcionando, sem mensalidade. Escrito para quem sabe usar terminal, mas nunca
administrou servidor. Reserve de uma a duas horas na primeira vez.

Fatos de provedores conferidos em **15 de outubro de 2026** (fontes no fim).
Planos gratuitos mudam sem aviso: confira de novo antes de depender deles.

Sumário:

1. [A decisão em poucas linhas](#1-a-decisão-em-poucas-linhas)
2. [Contas de que você vai precisar](#2-contas-de-que-você-vai-precisar)
3. [Conta na Oracle Cloud](#3-conta-na-oracle-cloud)
4. [Criar a VM](#4-criar-a-vm)
5. [Abrir as portas 80 e 443 na Oracle](#5-abrir-as-portas-80-e-443-na-oracle)
6. [Domínio grátis](#6-domínio-grátis)
7. [Preparar a VM](#7-preparar-a-vm)
8. [Gerar os segredos](#8-gerar-os-segredos)
9. [Subir o sistema](#9-subir-o-sistema)
10. [Criar a primeira clínica](#10-criar-a-primeira-clínica)
11. [Backup diário](#11-backup-diário)
12. [Atualizar a versão](#12-atualizar-a-versão)
13. [Ligar o e-mail de verdade](#13-ligar-o-e-mail-de-verdade)
14. [Ambiente de demonstração](#14-ambiente-de-demonstração)
15. [Monitoramento (opcional)](#15-monitoramento-opcional)
16. [Custos e limites](#16-custos-e-limites)
17. [Riscos](#17-riscos)
18. [O que NÃO fazer](#18-o-que-não-fazer)
19. [Plano B: sem VM](#19-plano-b-sem-vm)
20. [Fontes e o que não foi confirmado](#20-fontes-e-o-que-não-foi-confirmado)

---

## 1. A decisão em poucas linhas

**Plano A (recomendado):** uma VM ARM do **Oracle Cloud Always Free** em São
Paulo rodando a pilha completa em contêiner que o projeto já tem (Postgres,
MinIO, API, worker, web e Caddy). O Caddy obtém o certificado HTTPS sozinho
para um **domínio grátis do DuckDNS**. Backup diário cifrado vai para o
**Backblaze B2**, fora da Oracle.

Por quê:

- É a única opção gratuita, permanente, sempre ligada e no Brasil.
- O Postgres é seu e você é superusuário: a migração cria os papéis
  `chiron_app`, `chiron_iam` e `chiron_admin` (este com `BYPASSRLS`) sem
  adaptação. Em banco gerenciado isso precisa ser validado antes.
- Nenhuma mudança de código: a pilha que roda local com `pnpm stack:up` é a
  mesma, mais uma sobreposição para a internet.
- O worker e a API ficam sempre de pé, sem a espera de um minuto para
  "acordar" que os planos grátis de PaaS impõem.

O que vem pronto no repositório:

| Arquivo | Para que serve |
| --- | --- |
| `infra/scripts/bootstrap-vm.sh` | Prepara a VM: pacotes, firewall, swap, Docker, chave de implantação e clone |
| `infra/scripts/gerar-env.sh` | Gera o `.env.stack` com segredos fortes e aleatórios |
| `infra/scripts/dc.sh` | Atalho do `docker compose` da pilha pública (substitui o `dc` do RUNBOOK) |
| `infra/compose/docker-compose.publico.yml` | Sobreposição para a internet: portas 80 e 443, HTTPS, storage na mesma origem |
| `infra/proxy/Caddyfile.publico` | Proxy com certificado automático para o seu domínio |
| `infra/proxy/Caddyfile.demo` | O mesmo, com senha na porta, para o ambiente de demonstração |
| `infra/scripts/backup-vm.sh` | Backup diário da VM (chama o `backup.sh` que já existia) |
| `infra/scripts/backup.env.exemplo` | Modelo da configuração do backup |

**Plano B (sem VM):** Supabase Free mais Google Cloud Run. Tem mais peças,
exige ajustes que não estão prontos e serve melhor para demonstração. Ver a
[seção 19](#19-plano-b-sem-vm).

### O modo "piloto sem e-mail"

O convite e a redefinição de senha saem por e-mail pelo Resend, que exige um
domínio com DNS editável. O DuckDNS não permite os registros que o Resend
pede. Por isso o caminho 100% grátis sobe em **modo piloto**
(`APP_ENV=homolog`):

- tudo funciona igual, inclusive HTTPS e cookie seguro;
- quando alguém é convidado ou pede nova senha, o link aparece no log da API e
  você o envia por WhatsApp.

Para 1 a 3 clínicas isso é administrável. Quando quiser e-mail de verdade
(`APP_ENV=prod`), siga a [seção 13](#13-ligar-o-e-mail-de-verdade). Um domínio
`.com.br` custa cerca de R$ 40 por ano.

---

## 2. Contas de que você vai precisar

| Conta | Para quê | Cartão? |
| --- | --- | --- |
| Oracle Cloud | A VM | Sim, de crédito (ou débito sem PIN). Há uma pré-autorização temporária, estornada |
| GitHub | Você já tem; o servidor baixa o código por uma chave só de leitura | Não |
| DuckDNS (duckdns.org) | O nome `algo.duckdns.org` | Não; o login é com GitHub, Google etc. |
| Backblaze B2 | Cópia do backup fora da Oracle | Não |
| healthchecks.io (opcional) | Avisar se o backup não rodou | Não informado |
| UptimeRobot (opcional) | Avisar se o site cair | Não |

No seu computador: o terminal do Windows (PowerShell já tem `ssh` e `scp`) e
um gerenciador de senhas (Bitwarden, 1Password, KeePassXC). **Sem
gerenciador de senhas, não siga adiante**: os segredos gerados no passo 8 são
a única forma de recuperar o banco e os dados cifrados.

---

## 3. Conta na Oracle Cloud

1. Acesse `oracle.com/cloud/free` e clique em "Start for free".
2. Preencha os dados. Em **Home Region**, escolha **Brazil East (Sao Paulo)**
   (`sa-saopaulo-1`) ou **Brazil Southeast (Vinhedo)** (`sa-vinhedo-1`).
   - **Isso não muda depois.** A VM grátis só pode ser criada na home region.
   - Se nenhuma das duas aparecer, escolha a mais próxima disponível. A
     latência sobe, mas funciona.
3. Cadastre o cartão. A Oracle não aceita cartão virtual, de uso único,
   pré-pago nem débito com PIN. A pré-autorização some em poucos dias.
4. Espere o e-mail de conta pronta. Pode levar de minutos a algumas horas.

### Recomendado: passar para Pay As You Go com alerta de US$ 1

A Oracle pode **recuperar instâncias ociosas** da conta gratuita. Uma VM é
considerada ociosa quando, em 7 dias, CPU, rede e memória ficam todas abaixo
de 20% (no percentil 95). Um piloto com poucas clínicas fica abaixo disso.

Segundo o FAQ da Oracle, contas **Pay As You Go** não sofrem essa recuperação.
O upgrade continua custando **US$ 0 enquanto você ficar dentro do Always
Free**. Em troca, qualquer recurso fora do Always Free passa a ser cobrado.
Por isso o alerta de orçamento.

1. Menu > **Billing & Cost Management** > **Upgrade and Manage Payment** >
   Pay As You Go.
2. Menu > **Billing & Cost Management** > **Budgets** > **Create Budget**:
   - valor de **US$ 1**;
   - alerta em 100% do gasto **real**;
   - o seu e-mail como destino.
3. Daqui em diante, só crie recursos com o selo **Always Free-eligible**.

---

## 4. Criar a VM

Antes, crie no seu computador a chave SSH, para não lidar com permissão de
arquivo baixado:

```powershell
ssh-keygen -t ed25519 -f $HOME\.ssh\chiron_oci
Get-Content $HOME\.ssh\chiron_oci.pub    # copie esta linha
```

No console da Oracle: Menu > **Compute** > **Instances** > **Create instance**.

| Campo | Valor |
| --- | --- |
| Name | `chiron-prod` |
| Placement | O único availability domain (São Paulo e Vinhedo têm um só) |
| Image | **Change image** > **Ubuntu** > **Canonical Ubuntu 24.04**, versão **aarch64**. Não use a "Minimal". Em 15/10/2026 a mais recente era `Canonical-Ubuntu-24.04-aarch64-2026.09.18-0` |
| Shape | **Change shape** > **Virtual machine** > **Ampere** > **VM.Standard.A1.Flex** |
| OCPUs e memória | **2 OCPU e 12 GB**. Se também quiser a VM de demonstração (seção 14), use **1 OCPU e 6 GB** aqui e na outra |
| Networking | Criar nova VCN com sub-rede **pública**; **Assign a public IPv4 address**: sim |
| Add SSH keys | **Paste public keys**, colando a linha do `chiron_oci.pub` |
| Boot volume | **Specify a custom boot volume size**: **100 GB** (o Always Free dá 200 GB no total) |

Clique em **Create** e anote o **Public IP address** quando a VM ficar verde.

**"Out of capacity for shape VM.Standard.A1.Flex"** é comum em São Paulo:

- tente de novo em algumas horas, ou em horários de madrugada;
- tente o formato menor (1 OCPU e 6 GB);
- há relatos de que contas Pay As You Go conseguem com mais facilidade.

Não use a VM E2.1.Micro para esta pilha: com 1 GB de RAM e 1/8 de OCPU ela
não consegue construir a imagem do web.

**Limite que não pode ser ultrapassado:** o total de VMs A1 da conta é **2
OCPU e 12 GB**. A Oracle reduziu de 4 OCPU e 24 GB em junho de 2026, e
instâncias acima do limite são desativadas e apagadas.

---

## 5. Abrir as portas 80 e 443 na Oracle

São duas barreiras: a lista de segurança da rede (painel da Oracle, feita
aqui) e o firewall do sistema (o script da seção 7 resolve).

Menu > **Networking** > **Virtual cloud networks** > a VCN criada com a VM >
aba **Security** > **Security Lists** > **Default Security List for ...** >
aba **Security rules** > **Add Ingress Rules**. Crie três regras, deixando
**Stateless desmarcado**:

| Source CIDR | IP Protocol | Destination Port Range | Para quê |
| --- | --- | --- | --- |
| `0.0.0.0/0` | TCP | `80` | Certificado (desafio HTTP) e redirecionamento para HTTPS |
| `0.0.0.0/0` | TCP | `443` | O sistema |
| `0.0.0.0/0` | UDP | `443` | HTTP/3 (opcional) |

A porta 22 (SSH) já vem aberta.

---

## 6. Domínio grátis

### DuckDNS (recomendado)

1. Entre em `duckdns.org` com GitHub ou Google.
2. Em **sub domain**, escolha o nome (por exemplo, `clinicapiloto`) e clique em
   **add domain**.
3. Em **current ip**, ponha o **IP público da VM** e clique em **update ip**.
4. No seu computador, confira:
   ```powershell
   nslookup clinicapiloto.duckdns.org
   ```
   A resposta tem de ser o IP da VM.

O IP público da Oracle continua o mesmo quando a VM é parada e religada. Só
muda se a VM for apagada e recriada; nesse caso, atualize o DuckDNS.

O `duckdns.org` está na Public Suffix List. Para o Let's Encrypt, cada
subdomínio conta como domínio próprio, então o limite de 50 certificados por
semana é só seu.

### Alternativas sem conta nenhuma

`sslip.io` e `nip.io` transformam o IP em nome: `203-0-113-10.sslip.io`
aponta para `203.0.113.10`. O Let's Encrypt emite certificado para eles. O
nome fica feio e muda se o IP mudar, mas serve para um teste rápido.

### Quando precisar de e-mail

Veja a [seção 13](#13-ligar-o-e-mail-de-verdade).

---

## 7. Preparar a VM

No seu computador, a partir da raiz do repositório CHIRON:

```powershell
scp -i $HOME\.ssh\chiron_oci infra/scripts/bootstrap-vm.sh ubuntu@IP-DA-VM:
ssh -i $HOME\.ssh\chiron_oci ubuntu@IP-DA-VM
```

Já dentro da VM:

```bash
sudo bash bootstrap-vm.sh
```

O script faz isto, e pode ser rodado de novo sem estragar nada:

1. atualiza o Ubuntu e instala git, age, rclone, `pg_dump` 16 e atualizações
   automáticas de segurança;
2. libera 80 e 443 no iptables que a imagem da Oracle traz;
3. cria 4 GB de swap;
4. instala Docker e o plugin compose;
5. põe o usuário `ubuntu` no grupo `docker`;
6. cria uma **chave de implantação** e mostra a chave pública.

Neste último passo:

1. No GitHub, abra o repositório > **Settings** > **Deploy keys** > **Add
   deploy key**.
2. Cole a chave e **não** marque "Allow write access".
3. Volte ao terminal e aperte Enter.

O script clona o código em `/opt/chiron`.

Ao terminar:

```bash
exit                                     # sair do SSH
ssh -i $HOME\.ssh\chiron_oci ubuntu@IP-DA-VM   # entrar de novo (grupo docker)
```

Se o script disser que a atualização pede reinício, rode `sudo reboot` e
entre de novo depois de um minuto.

---

## 8. Gerar os segredos

```bash
cd /opt/chiron
bash infra/scripts/gerar-env.sh
```

Ele pergunta três coisas:

| Pergunta | Resposta |
| --- | --- |
| Domínio público | `clinicapiloto.duckdns.org` (sem `https://`) |
| E-mail para avisos do certificado | O seu e-mail |
| Chave da API do Resend | **Enter** para pular (modo piloto). Ver a seção 13 para ter e-mail |

O resultado é o `/opt/chiron/.env.stack`, com permissão só para o seu
usuário. Ele contém:

- `APP_ENV`: `prod` com e-mail, `homolog` no modo piloto;
- `COOKIE_SECURE=true` e a URL `https://` do seu domínio;
- senhas do Postgres e dos papéis da aplicação;
- `SESSION_SECRET`, `COLUMN_ENCRYPTION_KEY` e `COLUMN_HASH_KEY`;
- a credencial do MinIO e o nome do bucket (`chiron-arquivos`).

Todos os segredos são de 192 a 256 bits, gerados pelo `openssl`.

**Agora, antes de seguir:**

```bash
cat .env.stack
```

Copie o conteúdo inteiro para uma nota segura no gerenciador de senhas. Por
quê:

- sem `COLUMN_ENCRYPTION_KEY`, CPF e CNPJ gravados ficam ilegíveis para
  sempre, inclusive nos backups;
- sem `POSTGRES_PASSWORD`, nenhum backup é restaurado.

**Nunca rode o `gerar-env.sh` de novo** depois que o sistema subir. O script
recusa sobrescrever o arquivo; se precisar mudar um valor, edite o arquivo.

---

## 9. Subir o sistema

```bash
cd /opt/chiron
bash infra/scripts/dc.sh up -d --build
```

O primeiro build constrói as imagens de API, worker e web na própria VM.
Estimativa: de 10 a 30 minutos numa A1 (não foi medido em ARM). As próximas
atualizações são mais rápidas por causa do cache.

O serviço `migrate` roda sozinho antes da API: cria o banco, os papéis, as
políticas de RLS e os dados de referência. A API só sobe se ele terminar bem.
Para rodar a migração de novo à mão: `bash infra/scripts/dc.sh run --rm migrate`.

Conferência:

```bash
bash infra/scripts/dc.sh ps                       # todos "Up", com "(healthy)"
bash infra/scripts/dc.sh logs migrate | tail -5   # "... migração(ões) aplicada(s)"
curl -fsS http://localhost:8080/api/v1/ready      # {"status":"ok",...}
bash infra/scripts/dc.sh logs proxy | grep -i "certificate obtained"
```

Abra `https://clinicapiloto.duckdns.org/entrar` no navegador: cadeado fechado
e tela de login.

Se o certificado não sair, quase sempre é uma destas três coisas:

- o DNS ainda não aponta para a VM;
- falta a regra da porta 80 na lista de segurança (seção 5);
- o bootstrap não rodou até o fim.

O Caddy tenta de novo sozinho; depois de corrigir, rode
`bash infra/scripts/dc.sh restart proxy`.

Em todos os comandos do `docs/RUNBOOK.md` que usam `dc`, use
`bash infra/scripts/dc.sh` no lugar. Ele já inclui a sobreposição pública e o
`.env.stack`.

---

## 10. Criar a primeira clínica

O `provision-tenant` cria, numa transação só:

- a organização, com os módulos do plano;
- a unidade padrão;
- o proprietário;
- o link de convite.

```bash
cd /opt/chiron
bash infra/scripts/dc.sh run --rm --no-deps api node dist/database/provision-tenant.js \
  --slug clinica-exemplo \
  --nome "Clínica Veterinária Exemplo" \
  --plano clinic \
  --email dono@clinicaexemplo.com.br \
  --responsavel "Nome do Responsável" \
  --cidade "São Paulo" --uf SP \
  --conselho-numero 12345 --conselho-uf SP \
  --ativo
```

| Opção | Detalhe |
| --- | --- |
| `--plano` | `solo`, `clinic`, `hospital` ou `enterprise` |
| `--ativo` | Marca como cliente ativo. Sem ele, fica "em avaliação"; hoje o sistema não bloqueia nada por isso |
| `--ajuda` | Lista todas as opções |

A saída traz o **link de convite**, válido por 14 dias. Mande ao responsável
pela clínica. Ele abre o link, define nome e senha e já entra no sistema.

### Convidar a equipe

O responsável convida veterinários e recepção em **Configurações** >
**Convidar**.

No modo piloto o e-mail não sai: o link aparece no log da API. Para
encontrá-lo:

```bash
bash infra/scripts/dc.sh logs api | grep 'modo seco'
bash infra/scripts/dc.sh logs api | grep 'redefinição'   # "esqueci minha senha"
```

Cada linha traz o destinatário (`to`) e o link (`link` ou `resetUrl`). Envie
o link só para a pessoa certa: ele dá acesso à conta dela.

---

## 11. Backup diário

O backup precisa ficar **fora da Oracle**: se a conta for encerrada, ele
continua existindo.

Todo dia o backup:

- faz o dump do banco;
- cifra com `age`;
- envia para o Backblaze B2;
- guarda 30 diários e 12 mensais;
- espelha os documentos do MinIO.

### 11.1 Backblaze B2

1. Crie a conta em `backblaze.com` (B2 Cloud Storage), sem cartão. A região
   escolhida no cadastro (EUA ou UE) é onde o backup mora. O backup sai do
   Brasil cifrado, mas registre isso como transferência internacional no
   contrato do piloto.
2. Em **Buckets** > **Create a Bucket**:
   - nome único, por exemplo `chiron-backup-suaempresa`;
   - **Files in Bucket: Private**;
   - Object Lock desligado.
3. No bucket criado, abra **Lifecycle Settings** e marque **Keep only the last
   version of the file**.
4. Em **Application Keys** > **Add a New Application Key**:
   - acesso **só a esse bucket**;
   - **Read and Write**.

   Copie o `keyID` e a `applicationKey`, que aparecem uma única vez.

### 11.2 Chave de cifra

Na VM:

```bash
age-keygen -o /tmp/chiron-backup.key      # mostra "Public key: age1..."
cat /tmp/chiron-backup.key                # copie TUDO para o gerenciador de senhas
shred -u /tmp/chiron-backup.key           # a chave privada não fica no servidor
```

Guarde também uma cópia offline da chave privada. Quem tiver acesso ao bucket
de backup não deve ter acesso a ela.

### 11.3 Configurar e testar

```bash
cd /opt/chiron
cp infra/scripts/backup.env.exemplo .env.backup
chmod 600 .env.backup
nano .env.backup    # chave pública age1..., keyID, applicationKey, nome do bucket
bash infra/scripts/backup-vm.sh
```

A última linha deve ser `Backup concluído em ...s`. Depois, agende:

```bash
bash infra/scripts/backup-vm.sh --agendar   # todo dia às 06:10 UTC (03:10 em Brasília)
tail -f /var/log/chiron-backup.log          # acompanhar as próximas execuções
```

Para receber um aviso quando o backup **não** rodar:

1. Crie um check no healthchecks.io com período de 1 dia e tolerância de 1
   hora.
2. Ponha a URL de ping em `BACKUP_HEARTBEAT_URL` no `.env.backup`.

### 11.4 Testar a restauração

Faça na primeira semana e depois todo mês. Backup nunca restaurado não é
backup. O teste restaura num banco separado e confere o isolamento entre
clínicas; o sistema no ar não é tocado.

```bash
cd /opt/chiron
set -a; . ./.env.stack; . ./.env.backup; set +a

rclone lsf "$BACKUP_REMOTE/diario/" | tail -3          # escolha o mais recente
ARQ=chiron-AAAAMMDDTHHMMSSZ.dump.age                    # o nome escolhido
rclone copy "$BACKUP_REMOTE/diario/$ARQ" /var/tmp/
nano /var/tmp/chave.age                                  # cole a chave privada do gerenciador

bash infra/scripts/dc.sh exec -T postgres psql -U chiron_owner -d postgres \
  -c 'CREATE DATABASE chiron_teste_restauracao'

RESTORE_DATABASE_URL="postgres://chiron_owner:$POSTGRES_PASSWORD@127.0.0.1:5432/chiron_teste_restauracao" \
RESTORE_APP_URL="postgres://chiron_app:$DATABASE_ROLE_PASSWORD@127.0.0.1:5432/chiron_teste_restauracao" \
BACKUP_AGE_IDENTITY_FILE=/var/tmp/chave.age \
RLS_GUARD_CMD="bash infra/scripts/dc.sh exec -T \
  -e DATABASE_MIGRATION_URL=postgres://chiron_owner:$POSTGRES_PASSWORD@postgres:5432/chiron_teste_restauracao \
  -e DATABASE_URL=postgres://chiron_app:$DATABASE_ROLE_PASSWORD@postgres:5432/chiron_teste_restauracao \
  api node dist/database/verify-rls.js" \
bash infra/scripts/restore.sh "/var/tmp/$ARQ"

shred -u /var/tmp/chave.age "/var/tmp/$ARQ"
bash infra/scripts/dc.sh exec -T postgres psql -U chiron_owner -d postgres \
  -c 'DROP DATABASE chiron_teste_restauracao'
```

O resultado esperado é `Restauração concluída e guarda de RLS aprovada.`

Por que a guarda leva `-e`: ela roda dentro do contêiner da API e precisa
apontar para o banco restaurado, não para o que está no ar.

A restauração de verdade, num desastre, está no `docs/RUNBOOK.md`, seção 3.

---

## 12. Atualizar a versão

Fora do horário das clínicas:

```bash
cd /opt/chiron
bash infra/scripts/backup-vm.sh                  # backup antes de mexer
git rev-parse --short HEAD                       # anote: é para onde você volta
git pull
bash infra/scripts/dc.sh up -d --build
bash infra/scripts/dc.sh ps
curl -fsS http://localhost:8080/api/v1/ready
docker image prune -f                            # remove imagens velhas sem uso
```

Para voltar à versão anterior, veja `docs/RUNBOOK.md`, seção 2 (lembre que
migração não volta).

---

## 13. Ligar o e-mail de verdade

Com e-mail, o sistema roda em `APP_ENV=prod`:

- convites e redefinições chegam sozinhos;
- a API passa a exigir todas as invariantes de produção ao subir.

O Resend Free permite 3.000 e-mails por mês e 100 por dia, com até 3 domínios.

1. **Um domínio com DNS editável.** Duas opções:
   - `.com.br` no Registro.br, cerca de R$ 40 por ano. É a recomendada: melhor
     entrega e nome profissional. O DNS pode ficar no próprio Registro.br ou
     na Cloudflare (grátis).
   - deSEC (`desec.io`): grátis, um nome `algo.dedyn.io` por conta, aceita
     os registros TXT e MX que o Resend pede. **Não confirmado** que o Resend
     aceite verificar um `dedyn.io`, e a entrega tende a ser pior. Teste antes.
2. **Resend.**
   - Crie a conta e adicione o domínio. De preferência um subdomínio de
     envio, como `mail.seudominio.com.br`.
   - Crie no DNS os registros que o painel mostrar: MX e TXT (SPF) em
     `send.<domínio>` e TXT DKIM em `resend._domainkey.<domínio>`.
   - Espere ficar "Verified" e crie uma API key com permissão de envio.
3. **Apontar o domínio para a VM**, se for mudar o endereço do sistema: crie
   o registro A (`app.seudominio.com.br`, por exemplo) com o IP da VM.
4. **Editar o `.env.stack`** (não regenerar):

   ```bash
   cd /opt/chiron
   nano .env.stack
   ```

   ```dotenv
   APP_ENV=prod
   EMAIL_PROVIDER=resend
   EMAIL_API_KEY=re_...
   EMAIL_FROM="CHIRON <nao-responda@mail.seudominio.com.br>"
   # só se o endereço do sistema mudar:
   CHIRON_DOMAIN=app.seudominio.com.br
   STACK_PUBLIC_URL=https://app.seudominio.com.br
   ```

5. Aplique: `bash infra/scripts/dc.sh up -d`. Se a API não subir, a mensagem
   em `bash infra/scripts/dc.sh logs api` diz qual variável falta.

Se o endereço mudar, os convites antigos (com a URL velha) param de valer:
gere novos.

---

## 14. Ambiente de demonstração

Para mostrar o sistema a veterinários com dados fictícios: 72 pacientes, 37
tutores e 809 agendamentos, em duas clínicas.

O seed de demonstração:

- **apaga e recria** as organizações `demo` e `beta` a cada execução;
- cria usuários com e-mails previsíveis e **a mesma senha para todos**,
  publicada no README;
- recusa rodar com `APP_ENV=prod` ou `NODE_ENV=production`.

Por isso a demonstração:

- roda numa **VM separada**;
- tem uma **senha na porta** (HTTP Basic no Caddy), além do login do sistema;
- **nunca recebe dado real**.

### Passos

1. Crie a segunda VM como na seção 4. Use **1 OCPU e 6 GB** nas duas VMs para
   caber no limite de 2 OCPU e 12 GB. Use outro nome no DuckDNS (por exemplo,
   `chiron-demo`).
2. Siga as seções 5 a 7 normalmente.
3. Gere o ambiente em modo demonstração:

   ```bash
   cd /opt/chiron
   bash infra/scripts/gerar-env.sh --demo
   ```

   Ele mostra **uma única vez** o usuário e a senha da porta. Guarde no
   gerenciador de senhas e passe só a quem vai testar.
4. Suba e popule:

   ```bash
   bash infra/scripts/dc.sh up -d --build
   bash infra/scripts/dc.sh run --rm --no-deps -e NODE_ENV=development migrate node dist/database/seed.js
   ```

   O `NODE_ENV=development` vale só para esse comando e é o que libera o seed
   (os contêineres rodam com `production`). O `.env.stack` gerado com `--demo`
   já tem `APP_ENV=homolog`.
5. Abra `https://chiron-demo.duckdns.org`:
   - o navegador pede primeiro a senha da porta;
   - depois vem o login do sistema, com os acessos que o seed imprime (por
     exemplo, `vet@chiron.dev`).
6. Para zerar a demonstração, rode o comando do seed de novo.

Sem a segunda VM, dá para usar a mesma VM como demonstração **antes** do
piloto. Na hora de virar produção, apague tudo e comece do zero:

```bash
bash infra/scripts/dc.sh down -v
rm .env.stack
bash infra/scripts/gerar-env.sh
bash infra/scripts/dc.sh up -d
```

Nunca rode o seed na VM do piloto. Em modo piloto (`APP_ENV=homolog`), o
`NODE_ENV=development` passaria pela trava.

---

## 15. Monitoramento (opcional)

**UptimeRobot.** O plano Free tem 50 monitores a cada 5 minutos. A página de
preços descreve o plano como "para hobby e projetos sem fins lucrativos":
serve para o piloto, mas releia os termos antes de cobrar clientes. Crie dois
monitores HTTP:

- `https://<domínio>/healthz`: o proxy;
- `https://<domínio>/api/v1/ready`: a API com banco e storage.

O alerta vai por e-mail.

**healthchecks.io.** Plano gratuito com 20 checks. Use para o heartbeat do
backup (seção 11.3).

**Recursos da VM:**

```bash
docker stats --no-stream
free -h
df -h /
```

---

## 16. Custos e limites

| Item | Custo | Limite gratuito relevante |
| --- | --- | --- |
| VM Oracle A1 | R$ 0 | **2 OCPU e 12 GB no total** da conta; 200 GB de disco; 10 TB de saída por mês |
| Documentos (MinIO na VM) | R$ 0 | O disco da VM (100 GB no boot sugerido) |
| Domínio DuckDNS | R$ 0 | |
| Certificado Let's Encrypt | R$ 0 | Renovado sozinho pelo Caddy |
| Backup no Backblaze B2 | R$ 0 | 10 GB; o dump cifrado de 1 a 3 clínicas tem poucos MB |
| E-mail pelo Resend (opcional) | R$ 0 | 100 por dia e 3.000 por mês |
| Domínio `.com.br` (opcional, para e-mail) | cerca de R$ 40 por ano | |

Capacidade:

- 1 a 3 clínicas usam uma fração pequena da A1;
- a estimativa do `docs/PLANO_DE_LANCAMENTO.md` (seção 9.3) é de 40 a 60
  clínicas pequenas numa A1 de 2 OCPU e 12 GB. É ordem de grandeza, não
  medição.

O primeiro gargalo provável é o teto de 100 e-mails por dia do Resend, se
houver lembretes por e-mail.

---

## 17. Riscos

- **A Oracle pode mudar as regras.**
  - Já reduziu o Always Free em junho de 2026, sem anúncio.
  - Recupera instâncias ociosas (mitigação: Pay As You Go, seção 3).
  - Há relatos de contas encerradas.

  Por isso o backup diário fora da Oracle não é opcional.
- **Um servidor só.** Se a VM ou o disco falharem, tudo para.
  - Perda máxima: o que entrou desde o último backup (RPO de 24 h).
  - Tempo para voltar: 1 a 2 horas com o RUNBOOK (RTO).
  - Combine isso por escrito com as clínicas do piloto.
- **MinIO sem projeto ativo.**
  - A imagem `minio/minio` saiu do Docker Hub em setembro de 2026 e o
    repositório comunitário foi arquivado.
  - A sobreposição pública usa a build gratuita da Chainguard
    (`cgr.dev/chainguard/minio:latest`, só com a tag `latest`).
  - Funciona, mas é dependência de um terceiro. Planeje migrar o storage
    (Garage, SeaweedFS, Cloudflare R2 ou OCI Object Storage) antes de crescer.
- **Modo piloto sem e-mail.** Os links de convite e de senha passam por você.
  Se o log for apagado, peça à pessoa para gerar outro.
- **Memória.** A pilha usa menos de 1 GB e há limite de memória por
  contêiner. Numa VM de 6 GB sobra espaço. Mesmo assim, o build roda na própria
  VM e usa a swap: atualize fora do expediente.
- **LGPD.**
  - Os dados primários ficam em São Paulo.
  - O backup cifrado fica no B2 (EUA ou UE) e o e-mail passa pelo Resend
    (EUA).
  - Isso entra no contrato e no DPA do piloto (`docs/PLANO_DE_LANCAMENTO.md`,
    seções 6.2 e 8.5).

---

## 18. O que NÃO fazer

- **Não rodar o seed de demonstração no servidor do piloto.** Ele apaga e
  recria organizações e usa senha conhecida.
- **Não regenerar o `.env.stack`** nem perder a `COLUMN_ENCRYPTION_KEY`.
- **Não guardar a chave privada do `age` na VM**, nem junto do backup.
- **Não rodar `bash infra/scripts/dc.sh down -v` nem `docker volume prune`**
  no piloto: os volumes são o banco e os documentos.
- **Não ativar o UFW** nas imagens Ubuntu da Oracle; a Oracle desaconselha,
  porque pode impedir o boot. Não rodar `netfilter-persistent save` com o
  Docker ligado: grava as regras dinâmicas do Docker. O `bootstrap-vm.sh` já
  editou o firewall do jeito certo.
- **Não passar de 2 OCPU e 12 GB em VMs A1** nem criar recurso sem o selo
  Always Free.
- **Não publicar as portas do Postgres (5432) nem do MinIO (9000)** fora do
  `127.0.0.1`.
- **Não usar o ambiente de demonstração com dado real** nem tirar a senha da
  porta dele.
- **Não hospedar na Vercel Hobby.** Os termos restringem o plano a "uso
  pessoal não comercial".
- **Não usar Z-API ou Evolution em modo QR** para WhatsApp: violam os termos
  da Meta e há banimentos.
- **Não cobrar das clínicas** antes de empresa aberta, contrato e DPA
  assinados (`docs/PLANO_DE_LANCAMENTO.md`, seção 6).

---

## 19. Plano B: sem VM

Para quando a Oracle recusar o cadastro ou ficar semanas sem capacidade de A1.
Exige ajustes que **não estão prontos** neste repositório; por isso não há
passo a passo.

| Peça | Provedor | Grátis | Ressalva |
| --- | --- | --- | --- |
| Banco | Supabase Free, região `sa-east-1` (São Paulo) | 500 MB, 5 GB de egress, 2 projetos ativos | Pausa após 1 semana sem atividade, sem backup no plano grátis. O papel `postgres` não é superusuário, mas tem `CREATEROLE` e `BYPASSRLS`, o que deve permitir criar `chiron_admin` com `BYPASSRLS`. Validar a migração num projeto descartável |
| API e web | Google Cloud Run, `southamerica-east1` | 2 milhões de requisições, 180 mil vCPU-s e 360 mil GiB-s por mês (cobrança por requisição) | Cartão obrigatório; São Paulo é Tier 2 (o grátis rende menos); cold start de alguns segundos |
| Worker | Cloud Run worker pool | 384 mil vCPU-s por mês, o equivalente a cerca de 0,15 vCPU contínuo | Não verificado se cabe sempre ligado; a alternativa é mudar o worker para rodar como job agendado (mudança de código) |
| Arquivos | Cloudflare R2 | 10 GB, saída grátis | Ativação pede cartão ou PayPal; fica fora do Brasil; o bucket precisa de CORS, porque o navegador envia direto |
| E-mail | Resend | Igual ao plano A | Exige domínio próprio |

Peças eliminadas, com o motivo:

| Provedor | Por que não |
| --- | --- |
| Render Free | Background worker não é grátis; web dorme após 15 minutos; o Postgres grátis expira em 30 dias |
| Koyeb | Cartão com pré-autorização de US$ 29; a única instância grátis dorme e fica só em Frankfurt ou Washington |
| Fly.io | Sem plano grátis para contas novas, só um teste de 2 horas |
| Railway | US$ 1 de crédito por mês depois do teste |
| Neon Free | 100 CU-hora por mês; o worker sempre conectado gasta cerca de 182 |
| Northflank Sandbox | Pede cartão e se declara "não para produção"; serve como plano C |
| Vercel Hobby | Proíbe uso comercial |

Veredito: o plano B serve para demonstração e homologação. Para um piloto
com dados reais, o plano A é mais simples, mais rápido e não tem cold start.

---

## 20. Fontes e o que não foi confirmado

Lidas em 15/10/2026.

### Oracle Cloud

- Recursos Always Free: A1 com 1.500 OCPU-hora e 9.000 GB-hora por mês (2
  OCPU e 12 GB), 2 VMs E2.1.Micro, 200 GB de bloco (boot mínimo de 47 GB), 20
  GB de Object Storage, 10 TB de saída. Critério de ociosidade: 7 dias, p95
  abaixo de 20%.
  `docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm`
- Instâncias acima do limite: `docs.oracle.com/iaas/Content/FreeTier/freetier.htm`
- Regiões (São Paulo e Vinhedo com um AD cada):
  `docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm`
- Cadastro e cartão:
  `docs.oracle.com/en-us/iaas/Content/GSG/Tasks/signingup_topic-Sign_Up_for_Free_Oracle_Cloud_Promotion.htm`
- Imagens Ubuntu 24.04 aarch64: `docs.oracle.com/en-us/iaas/images/ubuntu-2404/`
- iptables nas imagens Ubuntu:
  `docs.oracle.com/en-us/iaas/developer-tutorials/tutorials/apache-on-ubuntu/01oci-ubuntu-apache-summary.htm`
- UFW desaconselhado:
  `docs.oracle.com/en-us/iaas/Content/Compute/References/bestpracticescompute.htm`
- Lista de segurança:
  `docs.oracle.com/iaas/Content/Network/Concepts/update-securitylist.htm`
- IP efêmero mantido ao parar a VM: blog da Oracle sobre IPs públicos
  reservados (`blogs.oracle.com/cloud-infrastructure`).
- Datas da redução de 4/24 para 2/12 (15/06/2026; aplicação a partir de
  18/08/2026): fontes secundárias (InfoQ, Linuxiac e um e-mail da Oracle
  citado no Hacker News).

### Outros provedores

- Backblaze B2: `backblaze.com/cloud-storage/pricing`, 10 GB grátis, sem cartão
  no cadastro.
- Cloudflare R2: `developers.cloudflare.com/r2/pricing`.
- Resend: `resend.com/pricing` e `resend.com/docs/add-a-domain`.
- Let's Encrypt: `letsencrypt.org/docs/rate-limits`.
- Public Suffix List (versão de 07/10/2026), com `duckdns.org` e `dedyn.io`:
  `publicsuffix.org/list/public_suffix_list.dat`
- deSEC: `desec.readthedocs.io`.
- Supabase: `supabase.com/pricing` e o repositório `github.com/supabase/postgres`
  (migração `demote-postgres`).
- Neon: `neon.com/docs/manage/roles`.
- Cloud Run: `cloud.google.com/run/pricing`.
- Render: `render.com/docs/free`.
- Koyeb: `koyeb.com/docs/faqs/pricing`.
- Fly.io: `docs.fly.io/about/pricing`.
- Vercel: `vercel.com/docs/limits/fair-use-guidelines`, atualizada em
  14/09/2026.
- MinIO arquivado: `github.com/minio/minio` e a issue 21647.
- Imagem da Chainguard: `cgr.dev/chainguard/minio`, testada localmente em amd64,
  com manifesto arm64.
- healthchecks.io: `healthchecks.io/pricing`.
- UptimeRobot: `uptimerobot.com/pricing`.

### Não confirmado

- Se São Paulo e Vinhedo aparecem como home region no cadastro do Free Tier
  hoje, e se têm A1 disponível. As páginas da Oracle que listam isso
  responderam 403.
- A isenção de recuperação por ociosidade em Pay As You Go: está no FAQ da
  Oracle (lido só pelo trecho da busca) e num e-mail da Oracle de 2023, não na
  página de recursos.
- Regra específica para cartão brasileiro no cadastro da Oracle.
- Se o Resend aceita verificar domínios `dedyn.io`.
- Limite de subdomínios por conta no DuckDNS (fala-se em 5).
- Se o plano grátis do healthchecks.io pede cartão.
- Tempo de build e consumo de memória da pilha em ARM: o teste de ponta a
  ponta deste guia rodou em amd64.

### O que foi testado neste repositório

Em 15/10/2026, em amd64, num projeto compose descartável, foram testados:

- `gerar-env.sh` nos três modos;
- a pilha com a sobreposição pública e `APP_ENV=prod`: todos os serviços
  saudáveis;
- HTTPS, redirecionamento 80 para 443, HSTS, cookie `Secure` e recusa de
  origem estranha;
- upload e download por URL assinada passando pelo Caddy, com acesso sem
  assinatura negado;
- `provision-tenant`, aceite do convite e o seed em modo demonstração;
- `backup-vm.sh`, com dump, cifra, envio, mensal e espelho, decifrado em
  seguida;
- restauração num banco novo com a guarda de RLS aprovada;
- `bash -n` e `shellcheck` sem apontamentos em todos os scripts.

Não foi possível testar sem uma VM real:

- emissão do certificado pelo Let's Encrypt;
- `bootstrap-vm.sh`, exceto a edição do `rules.v4` e os nomes de pacote no
  Ubuntu 24.04;
- o build em ARM.
