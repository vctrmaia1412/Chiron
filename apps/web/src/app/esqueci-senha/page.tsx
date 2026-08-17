'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Logo } from '@/components/brand/logo';

/**
 * A API responde igual existindo ou não a conta, para não confirmar cadastro a
 * quem só tem o e-mail. A tela segue a mesma regra: uma única mensagem de saída.
 */
const NEUTRAL_MESSAGE = 'Se houver conta com esse e-mail, enviamos as instruções.';

function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Informe um e-mail válido.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/password/forgot', { email: trimmed });
      setSent(true);
    } catch (caught) {
      // Falha de rede ou excesso de tentativas não diz nada sobre o cadastro, então
      // pode aparecer. Qualquer outro erro vira a mesma resposta neutra do servidor.
      if (caught instanceof ApiError && (caught.code === 'NETWORK_ERROR' || caught.code === 'RATE_LIMITED')) {
        setError(caught.message);
      } else {
        setSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 text-[var(--brand-ink)]">
          <MailCheck className="h-5 w-5" />
          <h1 className="text-lg font-semibold text-[var(--ink)]">Verifique seu e-mail</h1>
        </div>
        <p className="mt-2 text-sm text-[var(--ink-3)]">{NEUTRAL_MESSAGE}</p>
        <p className="mt-2 text-[13px] text-[var(--ink-3)]">
          O link vale por tempo limitado. Confira também a caixa de spam.
        </p>

        <Button asChild variant="secondary" size="lg" block className="mt-6">
          <Link href="/entrar">Voltar para o login</Link>
        </Button>

        <div className="mt-2 flex justify-center">
          <Button variant="link" size="sm" onClick={() => setSent(false)}>
            Usar outro e-mail
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm" noValidate>
      <h1 className="text-lg font-semibold text-[var(--ink)]">Esqueci minha senha</h1>
      <p className="mt-1 text-sm text-[var(--ink-3)]">
        Informe o e-mail cadastrado e enviamos o link para criar uma nova senha.
      </p>

      <div className="mt-6">
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
        Enviar instruções
      </Button>

      <div className="mt-2 flex justify-center">
        <Button asChild variant="link" size="sm">
          <Link href="/entrar">Voltar para o login</Link>
        </Button>
      </div>
    </form>
  );
}

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="h-9" />
          <p className="mt-2 text-[13px] text-[var(--ink-3)]">Gestão clínica veterinária</p>
        </div>
        <ForgotPasswordForm />
      </div>
      <footer className="safe-bottom px-5 pb-6 text-center text-[12px] text-[var(--ink-3)]">
        Dados clínicos protegidos. Nenhuma informação de paciente é guardada neste dispositivo.
      </footer>
    </main>
  );
}
