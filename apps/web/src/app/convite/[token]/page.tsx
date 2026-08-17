'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { ApiError, api, errorMessage, setActiveTenantId } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Logo } from '@/components/brand/logo';

/** Espelha acceptInvitationRequestSchema, para o erro aparecer antes da ida ao servidor. */
const MIN_PASSWORD = 10;
const MIN_NAME = 2;
const MIN_TOKEN = 20;

interface InvitationPreview {
  tenantName?: string | null;
}

interface AcceptInvitationResponse {
  tenantId: string;
}

function InvitationForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const routeParams = useParams();
  // O segmento pode chegar como array em rotas coringa: só string serve aqui.
  const rawToken = routeParams.token;
  const token = typeof rawToken === 'string' ? rawToken : '';

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Prévia opcional: quando a API expõe o convite, a tela diz qual organização
  // convidou. O fluxo funciona igual sem ela, então a falha é ignorada de propósito.
  const { data: preview } = useQuery({
    queryKey: ['invitation-preview', token],
    enabled: token.length >= MIN_TOKEN,
    retry: false,
    staleTime: Infinity,
    queryFn: () =>
      api.get<InvitationPreview>(`/auth/invitations/${encodeURIComponent(token)}`, undefined, {
        silentAuth: true,
      }),
  });

  const organization = preview?.tenantName?.trim() ?? '';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < MIN_NAME) {
      setError('Informe seu nome completo.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setError('A confirmação não confere com a senha escolhida.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post<AcceptInvitationResponse>('/auth/invitations/accept', {
        token,
        name: trimmedName,
        password,
      });

      // A sessão já veio no cookie: só falta o frontend saber qual é a organização ativa.
      setActiveTenantId(response.tenantId);
      queryClient.clear();
      router.replace('/');
    } catch (caught) {
      // Convite inexistente, já aceito ou vencido chega como validação sem detalhe
      // por campo. Nesse caso não adianta corrigir o formulário: a tela troca de estado.
      if (caught instanceof ApiError && caught.code === 'VALIDATION_FAILED' && caught.fieldIssues.length === 0) {
        setRejected(caught.message);
      } else {
        setError(errorMessage(caught, 'Não foi possível aceitar o convite.'));
      }
      setSubmitting(false);
    }
  }

  if (token.length < MIN_TOKEN || rejected) {
    return (
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-[var(--ink)]">Convite indisponível</h1>
        <p className="mt-2 text-sm text-[var(--ink-3)]">
          {rejected ??
            'O link do convite está incompleto ou foi copiado pela metade. Peça um novo convite ao administrador da clínica.'}
        </p>
        <Button asChild variant="secondary" size="lg" block className="mt-6">
          <Link href="/entrar">Ir para o login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm" noValidate>
      <h1 className="text-lg font-semibold text-[var(--ink)]">Aceitar convite</h1>
      <p className="mt-1 text-sm text-[var(--ink-3)]">
        {organization
          ? `Você foi convidado para ${organization}. Crie seu acesso para começar.`
          : 'Crie seu acesso para entrar na clínica que convidou você.'}
      </p>

      <div className="mt-6 space-y-4">
        <Field label="Nome completo" htmlFor="name">
          <Input
            id="name"
            type="text"
            name="name"
            autoComplete="name"
            autoCapitalize="words"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Como você aparece para a equipe"
          />
        </Field>

        <Field label="Senha" htmlFor="password" hint={`Mínimo de ${MIN_PASSWORD} caracteres.`}>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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

        <Field label="Confirmar senha" htmlFor="confirmation">
          <Input
            id="confirmation"
            type={showPassword ? 'text' : 'password'}
            name="confirmation"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </Field>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2.5 text-[13px] text-[var(--danger)]"
        >
          {error}
        </div>
      )}

      <Button type="submit" size="lg" block loading={submitting} className="mt-6">
        Criar acesso
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
          <InvitationForm />
        </Suspense>
      </div>
      <footer className="safe-bottom px-5 pb-6 text-center text-[12px] text-[var(--ink-3)]">
        Dados clínicos protegidos. Nenhuma informação de paciente é guardada neste dispositivo.
      </footer>
    </main>
  );
}
