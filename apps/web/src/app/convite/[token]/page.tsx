'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import type { InvitationPreview } from '@chiron/contracts';
import { ApiError, api, errorMessage, setActiveTenantId } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/primitives';
import { Logo } from '@/components/brand/logo';

/** Espelha acceptInvitationRequestSchema, para o erro aparecer antes da ida ao servidor. */
const MIN_PASSWORD = 10;
const MIN_NAME = 2;
const MIN_TOKEN = 20;

interface AcceptInvitationResponse {
  tenantId: string;
}

/** Link que não serve mais: sempre com o que fazer em seguida, porque a pessoa não tem a quem perguntar. */
function Unavailable({ title, message, signIn }: { title: string; message: string; signIn?: boolean }) {
  return (
    <div className="w-full max-w-sm">
      <h1 className="text-lg font-semibold text-[var(--ink)]">{title}</h1>
      <p className="mt-2 text-sm text-[var(--ink-3)]">{message}</p>
      <Button asChild variant={signIn ? 'primary' : 'secondary'} size="lg" block className="mt-6">
        <Link href="/entrar">{signIn ? 'Entrar' : 'Ir para o login'}</Link>
      </Button>
    </div>
  );
}

function InvitationScreen() {
  const routeParams = useParams();
  // O segmento pode chegar como array em rotas coringa: só string serve aqui.
  const rawToken = routeParams.token;
  const token = typeof rawToken === 'string' ? rawToken : '';
  const [rejected, setRejected] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['invitation-preview', token],
    enabled: token.length >= MIN_TOKEN,
    retry: false,
    staleTime: Infinity,
    queryFn: () =>
      api.get<InvitationPreview>(`/auth/invitations/${encodeURIComponent(token)}`, undefined, {
        silentAuth: true,
      }),
  });

  if (token.length < MIN_TOKEN) {
    return (
      <Unavailable
        title="Link incompleto"
        message="O link do convite está incompleto ou foi copiado pela metade. Abra de novo pelo botão do e-mail ou peça um novo convite à clínica."
      />
    );
  }

  if (rejected) return <Unavailable title="Convite indisponível" message={rejected} />;

  if (preview.isLoading) {
    return (
      <div className="w-full max-w-sm space-y-3" aria-busy="true" aria-label="Carregando convite">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (preview.error instanceof ApiError && preview.error.isNotFound) {
    return (
      <Unavailable
        title="Convite não encontrado"
        message="Este link não é válido. Se você recebeu mais de um e-mail de convite, use o mais recente. Se continuar sem funcionar, peça um novo convite à clínica."
      />
    );
  }

  // Outra falha na prévia (rede, servidor) não trava o aceite: o formulário
  // genérico continua funcionando, só sem os detalhes do convite.
  const info = preview.data ?? null;

  if (info?.status === 'expired') {
    return (
      <Unavailable
        title="Este convite expirou"
        message={`O convite de ${info.organizationName} venceu em ${formatDate(info.expiresAt)}. Peça para quem convidou você reenviar o convite: um link novo chega no seu e-mail.`}
      />
    );
  }
  if (info?.status === 'revoked') {
    return (
      <Unavailable
        title="Este convite foi cancelado"
        message={`${info.organizationName} cancelou este convite. Se você ainda precisa de acesso, fale com a clínica para receber um novo.`}
      />
    );
  }
  if (info?.status === 'accepted') {
    return (
      <Unavailable
        title="Este convite já foi usado"
        message={`O acesso a ${info.organizationName} já foi criado com este convite. Se foi você, é só entrar com seu e-mail e senha.`}
        signIn
      />
    );
  }

  return <AcceptForm token={token} info={info} onRejected={setRejected} />;
}

type FormField = 'name' | 'password' | 'confirmation';

function AcceptForm({
  token,
  info,
  onRejected,
}: {
  token: string;
  info: InvitationPreview | null;
  onRejected: (message: string) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const existingAccount = Boolean(info?.hasAccount);

  // `null` enquanto a pessoa não mexe: vale o nome que a clínica sugeriu.
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = typedName ?? info?.name ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function clearError(field: FormField) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  }

  function validate(): Partial<Record<FormField, string>> {
    const found: Partial<Record<FormField, string>> = {};
    if (existingAccount) {
      if (!password) found.password = 'Informe a senha da sua conta.';
      return found;
    }
    if (name.trim().length < MIN_NAME) found.name = 'Informe seu nome completo.';
    if (password.length < MIN_PASSWORD) found.password = `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
    else if (password !== confirmation) found.confirmation = 'A confirmação não confere com a senha escolhida.';
    return found;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const response = await api.post<AcceptInvitationResponse>('/auth/invitations/accept', {
        token,
        // Conta existente não renomeia ninguém: o nome é o que ela já usa.
        name: existingAccount ? undefined : name.trim(),
        password,
      });

      // A sessão já veio no cookie: só falta o frontend saber qual é a organização ativa.
      setActiveTenantId(response.tenantId);
      queryClient.clear();
      router.replace('/');
    } catch (caught) {
      setSubmitting(false);
      // Convite vencido, revogado ou já usado chega como validação sem detalhe
      // por campo. Não adianta corrigir o formulário: a tela troca de estado.
      if (caught instanceof ApiError && caught.code === 'VALIDATION_FAILED' && caught.fieldIssues.length === 0) {
        onRejected(caught.message);
        return;
      }
      if (caught instanceof ApiError && caught.code === 'INVALID_CREDENTIALS' && existingAccount) {
        setErrors({ password: 'Senha incorreta. Use a mesma senha com que você já entra no sistema.' });
        return;
      }
      setFormError(errorMessage(caught, 'Não foi possível aceitar o convite.'));
    }
  }

  const organization = info?.organizationName ?? '';
  const invitedBy = info?.invitedByName
    ? `${info.invitedByName} convidou você para a equipe de ${organization}.`
    : `Você recebeu um convite para a equipe de ${organization}.`;

  return (
    <form onSubmit={submit} className="w-full max-w-sm" noValidate>
      <h1 className="text-lg font-semibold text-[var(--ink)]">
        {existingAccount && organization ? `Entrar em ${organization}` : 'Aceitar convite'}
      </h1>
      <p className="mt-1 text-sm text-[var(--ink-3)]">
        {info ? invitedBy : 'Crie seu acesso para entrar na clínica que convidou você.'}
      </p>

      {info && (
        <dl className="mt-4 space-y-1.5 rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--ink-3)]">Clínica</dt>
            <dd className="min-w-0 text-right font-medium text-[var(--ink)]">{info.organizationName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--ink-3)]">Papel</dt>
            <dd className="min-w-0 text-right font-medium text-[var(--ink)]">{info.roleName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--ink-3)]">Convite para</dt>
            <dd className="min-w-0 break-all text-right text-[var(--ink)]">{info.emailMasked}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--ink-3)]">Vale até</dt>
            <dd className="text-right text-[var(--ink)]">{formatDate(info.expiresAt)}</dd>
          </div>
        </dl>
      )}

      {existingAccount && (
        <p className="mt-4 rounded-[var(--radius)] bg-[var(--info-soft)] px-3 py-2.5 text-[13px] text-[var(--ink-2)]">
          Este e-mail já tem conta no sistema. Entre com a sua senha atual para participar da clínica: você continua
          com a mesma conta, e a clínica nova aparece junto das que você já usa.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {!existingAccount && (
          <Field label="Nome completo" required error={errors.name}>
            <Input
              type="text"
              name="name"
              autoComplete="name"
              autoCapitalize="words"
              value={name}
              onChange={(event) => {
                setTypedName(event.target.value);
                clearError('name');
              }}
              placeholder="Como você aparece para a equipe"
            />
          </Field>
        )}

        <Field
          label={existingAccount ? 'Senha atual' : 'Senha'}
          htmlFor="password"
          required
          error={errors.password}
          hint={existingAccount ? undefined : `Mínimo de ${MIN_PASSWORD} caracteres.`}
        >
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete={existingAccount ? 'current-password' : 'new-password'}
              minLength={existingAccount ? undefined : MIN_PASSWORD}
              required
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password || !existingAccount ? 'password-mensagem' : undefined}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearError('password');
              }}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] p-2 text-[var(--ink-3)] hover:text-[var(--ink)]"
            >
              {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </button>
          </div>
        </Field>

        {!existingAccount && (
          <Field label="Confirmar senha" required error={errors.confirmation}>
            <Input
              type={showPassword ? 'text' : 'password'}
              name="confirmation"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                clearError('confirmation');
              }}
            />
          </Field>
        )}

        {existingAccount && (
          <p className="text-[13px] text-[var(--ink-3)]">
            Esqueceu a senha?{' '}
            <Link href="/esqueci-senha" className="font-medium text-[var(--brand)] underline-offset-4 hover:underline">
              Redefina por e-mail
            </Link>{' '}
            e depois volte a este link.
          </p>
        )}
      </div>

      {formError && (
        <div
          role="alert"
          className="mt-4 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2.5 text-[13px] text-[var(--danger)]"
        >
          {formError}
        </div>
      )}

      <Button type="submit" size="lg" block loading={submitting} className="mt-6">
        {existingAccount ? 'Entrar e aceitar convite' : 'Criar acesso e entrar'}
      </Button>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[12.5px] text-[var(--ink-3)]">
        <ShieldCheck className="h-3.5 w-3.5" />
        Acesso registrado em auditoria
      </p>
    </form>
  );
}

export default function InvitationPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="h-9" />
          <p className="mt-2 text-[13px] text-[var(--ink-3)]">Gestão clínica veterinária</p>
        </div>
        <Suspense fallback={<div className="h-64" />}>
          <InvitationScreen />
        </Suspense>
      </div>
      <footer className="safe-bottom px-5 pb-6 text-center text-[12px] text-[var(--ink-3)]">
        Dados clínicos protegidos. Nenhuma informação de paciente é guardada neste dispositivo.
      </footer>
    </main>
  );
}
