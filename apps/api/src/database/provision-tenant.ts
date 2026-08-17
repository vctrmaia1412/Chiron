import { Client } from 'pg';
import { PLANS } from '@chiron/contracts';
import { env } from '../config/env';
import { CryptoService } from '../common/crypto.service';
import { provisionTenant } from '../modules/tenant/provisioning.service';

/**
 * Cria uma organização nova pela linha de comando, do jeito que a venda de uma
 * segunda clínica precisa: uma transação, entitlements do plano escolhido,
 * unidade padrão, proprietário e link de convite pronto para enviar.
 *
 * Roda com o papel administrativo (BYPASSRLS): `platform.tenants` tem RLS
 * forçada e nenhuma política de INSERT, então o papel da aplicação não cria
 * organização por construção.
 */

const USAGE = `
Uso: pnpm --filter @chiron/api exec tsx src/database/provision-tenant.ts [opções]

Obrigatórias:
  --slug            identificador na URL (minúsculas, números e hífen)
  --nome            nome da organização
  --plano           ${PLANS.map((p) => p.key).join(' | ')}
  --email           e-mail do proprietário (recebe o convite)
  --responsavel     nome do proprietário

Unidade padrão:
  --unidade         nome da unidade (padrão: Unidade principal)
  --codigo-unidade  código curto da unidade (padrão: MTZ)
  --telefone        telefone da unidade
  --logradouro --numero --bairro --cidade --uf --cep

Opcionais:
  --timezone        fuso da organização (padrão: America/Sao_Paulo)
  --conselho        conselho profissional do proprietário (padrão: CRMV)
  --conselho-numero número de inscrição
  --conselho-uf     UF do conselho
  --ativo           cria já ativa, em vez de em avaliação
`.trim();

/** Aceita `--chave=valor` e `--chave valor`. Sem valor, vira sinalizador. */
function parseArgs(argv: readonly string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith('--')) continue;
    const body = token.slice(2);
    const separator = body.indexOf('=');
    if (separator >= 0) {
      parsed.set(body.slice(0, separator), body.slice(separator + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      parsed.set(body, next);
      index += 1;
      continue;
    }
    parsed.set(body, 'true');
  }
  return parsed;
}

function optional(flags: Map<string, string>, name: string): string | undefined {
  const value = flags.get(name)?.trim();
  return value ? value : undefined;
}

function required(flags: Map<string, string>, name: string): string {
  const value = optional(flags, name);
  if (!value) throw new Error(`Faltou --${name}.\n\n${USAGE}`);
  return value;
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.has('ajuda') || flags.has('help')) {
    console.log(USAGE);
    return;
  }

  const address: Record<string, unknown> = {};
  const addressFields: Array<[string, string]> = [
    ['logradouro', 'street'],
    ['numero', 'number'],
    ['bairro', 'district'],
    ['cidade', 'city'],
    ['uf', 'state'],
    ['cep', 'zip'],
  ];
  for (const [flag, field] of addressFields) {
    const value = optional(flags, flag);
    if (value) address[field] = value;
  }

  const input = {
    // Normaliza aqui também para que o que é impresso seja o que foi gravado.
    slug: required(flags, 'slug').toLowerCase(),
    name: required(flags, 'nome'),
    planKey: required(flags, 'plano'),
    timezone: optional(flags, 'timezone'),
    status: flags.has('ativo') ? ('active' as const) : ('trial' as const),
    facility: {
      name: optional(flags, 'unidade') ?? 'Unidade principal',
      code: optional(flags, 'codigo-unidade') ?? 'MTZ',
      address: Object.keys(address).length > 0 ? address : null,
      phone: optional(flags, 'telefone') ?? null,
    },
    owner: {
      email: required(flags, 'email'),
      name: required(flags, 'responsavel'),
      council: optional(flags, 'conselho') ?? null,
      councilNumber: optional(flags, 'conselho-numero') ?? null,
      councilState: optional(flags, 'conselho-uf') ?? null,
    },
  };

  const cfg = env();
  const url = cfg.DATABASE_ADMIN_URL ?? cfg.DATABASE_MIGRATION_URL ?? cfg.DATABASE_URL;
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query('BEGIN');
    const result = await provisionTenant(client, input, new CryptoService());
    await client.query('COMMIT');

    console.log('');
    console.log('Organização criada.');
    console.log('');
    console.log(`  Organização:  ${input.name} (slug: ${input.slug})`);
    console.log(`  tenantId:     ${result.tenantId}`);
    console.log(`  Unidade:      ${input.facility.name} (${input.facility.code}) ${result.facilityId}`);
    console.log(`  Proprietário: ${input.owner.name} <${input.owner.email}>`);
    console.log('');
    if (result.invitationToken) {
      console.log('  Link de convite (vale 14 dias, define a senha do proprietário):');
      console.log(`  ${cfg.PUBLIC_APP_URL}/convite/${result.invitationToken}`);
    } else {
      console.log('  Sem convite: a senha do proprietário já estava definida.');
    }
    console.log('');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Falha ao provisionar a organização:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
