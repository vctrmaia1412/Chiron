# Runbook de operação

Para quem está de plantão. Comando pronto, na ordem em que se usa, sem teoria.
Arquitetura está em `ARCHITECTURE.md`; desenvolvimento, em `DEVELOPMENT.md`.

## 0. Preparação do terminal

Tudo abaixo roda no servidor, dentro do diretório do projeto.

```bash
cd /opt/chiron
dc() { docker compose -f infra/compose/docker-compose.yml --env-file .env "$@"; }

dc ps                       # o que está de pé
dc logs -f --tail=100 api   # log ao vivo de um serviço
```

Acesso ao banco pelo contêiner, sem senha na linha de comando:

```bash
dc exec -T postgres psql -U chiron_owner -d chiron   # dono: DDL, restauração
dc exec -T postgres psql -U chiron_admin -d chiron   # BYPASSRLS: manutenção cross-tenant
dc exec -T postgres psql -U chiron_app   -d chiron   # papel da aplicação, sujeito ao RLS
```

As tabelas de tenant têm `FORCE ROW LEVEL SECURITY`. Na pilha em contêiner o
`chiron_owner` é superusuário e enxerga tudo; em banco gerenciado ele não é, e
consulta sem contexto devolve zero linhas. Para manutenção que atravessa
organizações, use `chiron_admin`.

## 1. Subir e atualizar a pilha

```bash
cd /opt/chiron
git rev-parse --short HEAD          # anote: é para onde você volta
git fetch --all --tags
git checkout <tag ou sha>
dc up -d --build
```

O serviço `migrate` roda antes da API e aplica as migrações pendentes. A API só
sobe se ele terminar com sucesso.

Conferência pós-deploy:

```bash
dc logs migrate | tail -20
curl -fsS http://localhost:8080/healthz            # proxy
curl -fsS http://localhost:8080/api/v1/health      # api viva
curl -fsS http://localhost:8080/api/v1/ready       # api com banco
dc exec -T worker curl -fsS http://127.0.0.1:3334/ready
```

Atualize fora do horário da clínica. A API recusa subir com configuração de
produção incompleta (seção 11) e a mensagem diz qual variável falta.

## 2. Reverter para a versão anterior

As imagens são construídas no servidor, então reverter é voltar o código e
reconstruir:

```bash
git checkout <sha anterior>
dc up -d --build api web worker
```

Migração não volta. Confira o que a atualização aplicou:

```sql
SELECT name, applied_at FROM platform.schema_migrations ORDER BY applied_at DESC LIMIT 5;
```

Se a versão anterior não sobe por causa do schema novo, o caminho é restaurar o
banco (seção 3), não editar migração aplicada.

## 3. Restaurar banco e documentos

**RPO 24 h**: o backup roda uma vez por dia, então o pior caso é perder o que
entrou desde o último dump. **RTO 1 a 2 h**: alvo entre a decisão de restaurar e
o sistema no ar. Restauração é ensaiada todo mês; backup nunca testado não é
backup.

```bash
# 1. congelar a escrita
dc stop api worker

# 2. escolher e baixar o dump
rclone lsf "$BACKUP_REMOTE/diario/" | tail -5
rclone copy "$BACKUP_REMOTE/diario/chiron-20260817T031000Z.dump.age" /var/tmp/

# 3. criar o banco alvo, separado do que está no ar
dc exec -T postgres psql -U chiron_owner -d postgres -c 'CREATE DATABASE chiron_restaurado'

# 4. restaurar e verificar o isolamento
set -a; . ./.env; set +a          # senhas do .env na sessão do terminal
export RESTORE_DATABASE_URL="postgres://chiron_owner:$POSTGRES_PASSWORD@127.0.0.1:5432/chiron_restaurado"
export RESTORE_APP_URL="postgres://chiron_app:$DATABASE_ROLE_PASSWORD@127.0.0.1:5432/chiron_restaurado"
export BACKUP_AGE_IDENTITY_FILE=/etc/chiron/age.key
infra/scripts/restore.sh /var/tmp/chiron-20260817T031000Z.dump.age
```

O script decifra, restaura e roda a guarda de RLS no fim. Se a guarda reprovar,
não aponte a aplicação para esse banco.

O Postgres da pilha não publica porta. Para o host alcançá-lo, publique no
loopback (`ports: ["127.0.0.1:5432:5432"]` no serviço `postgres`) ou rode o
script em um contêiner ligado à rede `chiron`.

```bash
# 5. trocar os nomes (com api e worker parados, sem conexão aberta)
dc exec -T postgres psql -U chiron_owner -d postgres <<'SQL'
ALTER DATABASE chiron RENAME TO chiron_avariado;
ALTER DATABASE chiron_restaurado RENAME TO chiron;
SQL

# 6. voltar ao ar
dc up -d api worker
curl -fsS http://localhost:8080/api/v1/ready
```

Documentos, quando o bucket primário se perdeu:

```bash
rclone sync "$BACKUP_REMOTE/documentos" oci:chiron-docs
```

`sync` apaga no destino o que não existe na cópia. Confira o caminho antes de
apertar o enter.

Fim do procedimento: entrar no sistema, abrir um prontuário e baixar um
documento. Depois, apagar `chiron_avariado` só quando a clínica confirmar que
está tudo lá.

## 4. Banco fora do ar

Sintoma: `/api/v1/ready` em `degraded`, login falhando, erro 500 em tudo.

```bash
dc ps postgres
dc logs --tail=100 postgres
df -h                                            # disco cheio derruba o Postgres
dc exec -T postgres pg_isready -U chiron_owner -d chiron
dc restart postgres
```

Conexões esgotadas ou consulta travada (`max_connections=200`):

```sql
SELECT count(*) FROM pg_stat_activity;

SELECT pid, state, wait_event_type, now() - query_start AS duracao, left(query, 80) AS consulta
  FROM pg_stat_activity
 WHERE state <> 'idle'
 ORDER BY duracao DESC LIMIT 10;

SELECT pg_terminate_backend(<pid>);
```

Se o volume corrompeu ou o dado sumiu, vá para a seção 3.

## 5. Storage fora do ar

Sintoma: upload e download de documento falham e o PDF não sai. O resto do
sistema continua funcionando, porque o readiness só checa o banco.

```bash
dc ps minio
dc logs --tail=100 minio
dc exec -T minio mc ready local
dc restart minio
```

Com provedor externo: confira `S3_ENDPOINT`, a credencial e a página de status
do provedor. Documento registrado e não enviado fica em `pending_upload`, e o
job `purge-uploads` apaga esses registros depois de 24 h. Em incidente longo,
pare o worker para não perder os registros do que a clínica tentou enviar:

```bash
dc stop worker      # e dc start worker quando o storage voltar
```

## 6. Worker parado ou evento morto

```bash
dc ps worker
dc exec -T worker curl -fsS http://127.0.0.1:3334/ready   # traz outbox e último erro
dc logs --tail=100 worker
dc restart worker
```

O worker recusa subir sem `DATABASE_ADMIN_URL`: sem o papel com BYPASSRLS ele
não enxerga a outbox das organizações.

Consultas de outbox, com `chiron_admin`:

```sql
-- panorama
SELECT count(*) FILTER (WHERE published_at IS NULL AND dead_at IS NULL) AS pendentes,
       count(*) FILTER (WHERE dead_at IS NOT NULL) AS mortos
  FROM platform.domain_events;

-- eventos mortos, do mais recente para o mais antigo
SELECT id, tenant_id, event_type, attempts, dead_at, left(last_error, 160) AS erro
  FROM platform.domain_events
 WHERE dead_at IS NOT NULL
 ORDER BY dead_at DESC LIMIT 20;

-- fila parada: o que está esperando e desde quando
SELECT event_type, count(*) AS total, min(occurred_at) AS mais_antigo
  FROM platform.domain_events
 WHERE published_at IS NULL AND dead_at IS NULL
 GROUP BY event_type ORDER BY total DESC;
```

Reprocessar depois de corrigir a causa (o relay pega no próximo ciclo, em
poucos segundos, sem reiniciar nada):

```sql
-- um evento
UPDATE platform.domain_events
   SET dead_at = NULL, attempts = 0, last_error = NULL
 WHERE id = '<uuid do evento>';

-- todos os mortos de um tipo
UPDATE platform.domain_events
   SET dead_at = NULL, attempts = 0, last_error = NULL
 WHERE dead_at IS NOT NULL AND event_type = '<tipo>';
```

Evento que não deve mesmo ser entregue fica morto onde está. A outbox é
histórico: não apague linha.

## 7. Destravar usuário bloqueado por tentativas

Oito senhas erradas bloqueiam por 15 minutos, e o bloqueio expira sozinho.
Destrave só quando a pessoa estiver na linha e o acesso for urgente.

```sql
SELECT email, status, failed_login_attempts, locked_until
  FROM iam.users WHERE email = 'pessoa@clinica.com.br';

UPDATE iam.users
   SET failed_login_attempts = 0, locked_until = NULL
 WHERE email = 'pessoa@clinica.com.br';
```

`iam.users` é tabela global, sem RLS: use `chiron_iam` ou `chiron_owner`. Se as
tentativas vierem de vários IPs ou de vários e-mails, é ataque: mantenha o
bloqueio e verifique `audit.audit_log` com `category = 'auth'`.

## 8. Rotação de segredos

Gere qualquer segredo novo com `openssl rand -base64 48`.

### SESSION_SECRET

O identificador de sessão é guardado como HMAC desse segredo. Trocar derruba
todas as sessões e todo mundo entra de novo. Faça fora do horário da clínica.

```bash
# .env: SESSION_SECRET=<novo>
dc up -d api
dc exec -T postgres psql -U chiron_owner -d chiron \
  -c "UPDATE iam.sessions SET revoked_at = now() WHERE revoked_at IS NULL"
```

### DATABASE_ROLE_PASSWORD

A migração 0005 já foi aplicada e não roda de novo, então a troca é manual:

```bash
NOVA=$(openssl rand -base64 32 | tr -d '/+=')

dc exec -T postgres psql -U chiron_owner -d chiron -v senha="$NOVA" <<'SQL'
ALTER ROLE chiron_app   PASSWORD :'senha';
ALTER ROLE chiron_iam   PASSWORD :'senha';
ALTER ROLE chiron_admin PASSWORD :'senha';
SQL

# .env: DATABASE_ROLE_PASSWORD=<a mesma senha>
dc up -d api worker
```

API e worker montam as URLs de conexão a partir dessa variável, então a senha
precisa ser exatamente a mesma nos dois lugares. A senha do `chiron_owner` é a
`POSTGRES_PASSWORD` e roda pelo mesmo caminho (`ALTER ROLE chiron_owner`).

### COLUMN_ENCRYPTION_KEY e COLUMN_HASH_KEY

**Perder `COLUMN_ENCRYPTION_KEY` torna CPF e CNPJ irrecuperáveis.** O banco
guarda `document_encrypted` (AES-256-GCM derivada dessa chave) em
`registry.guardians` e `platform.legal_entities`. O dump tem o texto cifrado, e
só isso: sem a chave, nenhum backup traz o documento de volta.

Por isso a chave fica em cofre separado do dump, e quem tem acesso ao bucket de
backup não tem acesso ao cofre. Guardar a chave junto do dump anula a cifra:
quem levar o bucket leva os dois. O mínimo aceitável é a chave em gerenciador de
senhas do responsável mais uma cópia offline, ambas fora do servidor.

`COLUMN_HASH_KEY` alimenta o índice cego `document_hash` (busca por CPF e CNPJ) e
o hash dos tokens de convite e de redefinição de senha. Trocar quebra a busca
por documento e invalida convites e resets pendentes.

Não existe rotina de recifra hoje: trocar qualquer uma das duas exige um passo
que lê, decifra com a chave antiga e grava com a nova, linha a linha. Enquanto
esse passo não existir, as duas chaves são guardadas, não rotacionadas. Se uma
delas vazar, trate como incidente e escreva o script de recifra antes de trocar.

## 9. Disco cheio

```bash
df -h
docker system df
sudo du -xh --max-depth=1 /var/lib/docker/volumes | sort -h | tail
dc exec -T postgres psql -U chiron_owner -d chiron -c "SELECT pg_size_pretty(pg_database_size('chiron'))"
```

Limpeza segura, nesta ordem:

```bash
docker image prune -af --filter "until=168h"
docker builder prune -af
rm -f /tmp/chiron-backup.*/*.dump          # sobra de backup interrompido
```

Nunca rode `docker volume prune`: os volumes são o banco e os documentos. O log
dos contêineres já tem rotação (10 MB por arquivo, 5 arquivos por serviço).

Maiores tabelas, quando o crescimento é do banco:

```sql
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS tamanho
  FROM pg_catalog.pg_statio_user_tables
 ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
```

Postgres com disco cheio para de aceitar escrita. Libere espaço e
`dc restart postgres`.

## 10. Localizar o erro de um cliente pelo requestId

Toda resposta de erro traz `requestId`, que a tela mostra como referência, e
toda resposta traz o cabeçalho `x-request-id`. Peça a referência e o horário,
nunca print com dado de paciente.

```bash
dc logs --since 3h api | grep -F 'req-42'
```

O identificador é sequencial por processo (`req-1`, `req-2`, ...). Reiniciou a
API, a contagem recomeça: filtre sempre por janela de tempo.

No banco, com `chiron_admin` (as tabelas de auditoria têm RLS por organização):

```sql
SELECT occurred_at, category, action, entity_table, entity_id, actor_user_id
  FROM audit.audit_log WHERE request_id = 'req-42' ORDER BY occurred_at;

SELECT occurred_at, resource, resource_id, patient_id, actor_user_id
  FROM audit.access_log WHERE request_id = 'req-42';
```

O log estruturado não registra e-mail, documento nem telefone: esses campos saem
como `[redacted]`. O que identifica o caso é o `requestId`, o `tenantId` e o id
da entidade.

## 11. Variáveis obrigatórias por serviço

Fonte: `apps/api/src/config/env.ts`, `apps/worker/src/config.ts` e
`infra/compose/docker-compose.yml`. Todas vivem no `.env` do servidor, fora do
versionamento.

### API

| Variável | Observação |
| --- | --- |
| `DATABASE_URL` | papel `chiron_app` |
| `SESSION_SECRET` | mínimo de 32 caracteres |
| `COLUMN_ENCRYPTION_KEY` | mínimo de 32 caracteres |
| `COLUMN_HASH_KEY` | mínimo de 32 caracteres |
| `APP_ENV` | `prod` ou `homolog`; com `NODE_ENV=production` e `APP_ENV=dev` a API recusa subir |
| `DATABASE_IAM_URL` | obrigatória com `APP_ENV=prod` |
| `DATABASE_ADMIN_URL` | obrigatória com `APP_ENV=prod` |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | obrigatórias com `APP_ENV=prod` |
| `PUBLIC_APP_URL` | com `APP_ENV=prod`, precisa ser a URL `https` pública |
| `COOKIE_SECURE` | `true` com `APP_ENV=prod` |
| `S3_ENDPOINT`, `S3_BUCKET` | endpoint interno do storage |
| `S3_PUBLIC_ENDPOINT` | endpoint que o navegador enxerga, usado ao assinar a URL |
| `LOG_LEVEL` | `info` em produção |

Segredo com `change_me` ou começando com `dev_` derruba o boot em produção, de
propósito: são os valores do `.env.example`.

### Migrador (serviço `migrate`)

| Variável | Observação |
| --- | --- |
| `DATABASE_MIGRATION_URL` | papel `chiron_owner` |
| `DATABASE_ROLE_PASSWORD` | obrigatória fora de desenvolvimento; vira a senha de `chiron_app`, `chiron_iam` e `chiron_admin` |
| `DATABASE_URL`, `SESSION_SECRET`, `COLUMN_ENCRYPTION_KEY`, `COLUMN_HASH_KEY` | a validação de configuração é a mesma da API |

### Worker

| Variável | Observação |
| --- | --- |
| `DATABASE_URL` | papel `chiron_app` |
| `DATABASE_ADMIN_URL` | papel `chiron_admin`, com BYPASSRLS; sem ela o worker não sobe |
| `APP_ENV`, `LOG_LEVEL` | iguais aos da API |
| `WORKER_POLL_MS`, `WORKER_BATCH_SIZE`, `WORKER_MAX_ATTEMPTS`, `WORKER_HEALTH_PORT` | opcionais, com padrão |

### Web

| Variável | Observação |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | argumento de build; na pilha vale `/api/v1`, mesma origem do proxy |
| `PORT` | 3000 |

### Infraestrutura (compose)

| Variável | Observação |
| --- | --- |
| `POSTGRES_PASSWORD` | senha do `chiron_owner` |
| `REDIS_PASSWORD` | senha do Redis |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | credencial do MinIO ou do provedor |
| `DATABASE_ROLE_PASSWORD` | monta as URLs de API e worker |
| `SESSION_SECRET`, `COLUMN_ENCRYPTION_KEY`, `COLUMN_HASH_KEY` | repassadas a API e migrador |
| `STACK_PUBLIC_URL` | vira `PUBLIC_APP_URL` da API |
| `PROXY_PORT` | porta publicada do proxy, padrão 8080 |

### Backup (cron do host, `infra/scripts/backup.sh`)

| Variável | Observação |
| --- | --- |
| `BACKUP_DATABASE_URL` | conexão do `pg_dump`; na falta, usa `DATABASE_MIGRATION_URL`. Precisa ser papel superusuário ou com BYPASSRLS: com `FORCE ROW LEVEL SECURITY` o `pg_dump` de um papel comum falha |
| `BACKUP_AGE_PUBLIC_KEY` | chave pública age; aceita mais de uma, separadas por espaço |
| `BACKUP_REMOTE` | destino `rclone` (`r2:bucket/prefixo`) ou `s3://bucket/prefixo` |
| `BACKUP_DOCUMENTS_SOURCE` | origem do espelho do bucket de documentos |
| `BACKUP_HEARTBEAT_URL` | ping no monitor externo ao terminar; sem ping no horário, abra incidente |
| `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_MONTHLY` | retenção, padrão 30 e 12 |

Cron sugerido, fora do horário da clínica:

```cron
10 3 * * * /opt/chiron/infra/scripts/backup.sh >> /var/log/chiron-backup.log 2>&1
```

O cron roda no host, então valem os mesmos pré-requisitos da seção 3: o
Postgres precisa estar alcançável pelo host (porta publicada no loopback ou
script em contêiner na rede `chiron`), e `pg_dump`, `age` e `rclone` instalados.
