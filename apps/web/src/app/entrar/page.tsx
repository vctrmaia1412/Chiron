'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import type { LoginResponse, TenantSummary } from '@chiron/contracts';
import { ApiError, api, errorMessage, setActiveTenantId } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Logo } from '@/components/brand/logo';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    params.get('expirada') ? 'Sua sessão expirou. Entre novamente para continuar.' : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await api.post<LoginResponse>('/auth/login', { email: email.trim(), password });

      if (!response.activeTenantId && response.availableTenants.length > 1) {
        setTenants(response.availableTenants);
        setSubmitting(false);
        return;
      }
      if (!response.activeTenantId && response.availableTenants.length === 0) {
        setError('Sua conta não está vinculada a nenhuma organização. Fale com o administrador.');
        setSubmitting(false);
        return;
      }

      setActiveTenantId(response.activeTenantId);
      queryClient.clear();
      router.replace('/');
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'ACCOUNT_LOCKED') {
        setError('Conta bloqueada temporariamente por tentativas de acesso. Tente novamente em alguns minutos.');
      } else {
        setError(errorMessage(caught, 'Não foi possível entrar.'));
      }
      setSubmitting(false);
    }
  }

  async function chooseTenant(tenantId: string) {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/me/context', { tenantId });
      setActiveTenantId(tenantId);
      queryClient.clear();
      router.replace('/');
    } catch (caught) {
      setError(errorMessage(caught));
      setSubmitting(false);
    }
  }

  if (tenants) {
    return (
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-[var(--ink)]">Escolha a organização</h1>
        <p className="mt-1 text-sm text-[var(--ink-3)]">Você participa de mais de uma clínica.</p>
        <div className="mt-5 space-y-2">
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              disabled={submitting}
              onClick={() => chooseTenant(tenant.id)}
              className="flex w-full items-center justify-between rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-60"
            >
              <span>
                <span className="block text-sm font-medium text-[var(--ink)]">{tenant.name}</span>
                <span className="block text-[13px] text-[var(--ink-3)]">
                  {tenant.facilities.length === 1
                    ? tenant.facilities[0]?.name
                    : `${tenant.facilities.length} unidades`}
                </span>
              </span>
            </button>
          ))}
        </div>
        {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm" noValidate>
      <h1 className="text-lg font-semibold text-[var(--ink)]">Entrar</h1>
      <p className="mt-1 text-sm text-[var(--ink-3)]">Acesse com suas credenciais da clínica.</p>

      <div className="mt-6 space-y-4">
        <Field label="E-mail" htmlFor="email">
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@clinica.com.br"
          />
        </Field>

        <Field label="Senha" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
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
      </div>

      {error && (
        <div className="mt-4 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2.5 text-[13px] text-[var(--danger)]">
          {error}
        </div>
      )}

      <Button type="submit" size="lg" block loading={submitting} className="mt-6">
        Entrar
      </Button>

      <div className="mt-2 flex justify-center">
        <Button asChild variant="link" size="sm">
          <Link href="/esqueci-senha">Esqueci minha senha</Link>
        </Button>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[12.5px] text-[var(--ink-3)]">
        <ShieldCheck className="h-3.5 w-3.5" />
        Acesso registrado em auditoria
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="h-9" />
          <p className="mt-2 text-[13px] text-[var(--ink-3)]">Gestão clínica veterinária</p>
        </div>
        <Suspense fallback={<div className="h-64" />}>
          <LoginForm />
        </Suspense>
      </div>
      <footer className="safe-bottom px-5 pb-6 text-center text-[12px] text-[var(--ink-3)]">
        Dados clínicos protegidos. Nenhuma informação de paciente é guardada neste dispositivo.
      </footer>
    </main>
  );
}
