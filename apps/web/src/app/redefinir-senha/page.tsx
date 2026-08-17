'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { ApiError, api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Logo } from '@/components/brand/logo';

/** Espelha resetPasswordRequestSchema, para o erro aparecer antes da ida ao servidor. */
const MIN_PASSWORD = 10;
const MIN_TOKEN = 20;

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

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
      await api.post('/auth/password/reset', { token, password });
      // Trocar a senha encerra as sessões abertas, então o caminho é o login.
      toast.success('Senha alterada. Entre com a nova senha.');
      router.replace('/entrar');
    } catch (caught) {
      // Link vencido, já usado ou inexistente chega como validação sem detalhe por
      // campo. Nesse caso não adianta corrigir o formulário: a tela troca de estado.
      if (caught instanceof ApiError && caught.code === 'VALIDATION_FAILED' && caught.fieldIssues.length === 0) {
        setRejected(caught.message);
      } else {
        setError(errorMessage(caught, 'Não foi possível redefinir a senha.'));
      }
      setSubmitting(false);
    }
  }

  if (token.length < MIN_TOKEN || rejected) {
    return (
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-[var(--ink)]">Link inválido ou expirado</h1>
        <p className="mt-2 text-sm text-[var(--ink-3)]">
          {rejected ?? 'O link de redefinição está incompleto ou já foi usado. Peça um novo para continuar.'}
        </p>
        <Button asChild size="lg" block className="mt-6">
          <Link href="/esqueci-senha">Pedir novo link</Link>
        </Button>
        <div className="mt-2 flex justify-center">
          <Button asChild variant="link" size="sm">
            <Link href="/entrar">Voltar para o login</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm" noValidate>
      <h1 className="text-lg font-semibold text-[var(--ink)]">Criar nova senha</h1>
      <p className="mt-1 text-sm text-[var(--ink-3)]">
        Ao concluir, as sessões abertas nos outros dispositivos são encerradas.
      </p>

      <div className="mt-6 space-y-4">
        <Field label="Nova senha" htmlFor="password" hint={`Mínimo de ${MIN_PASSWORD} caracteres.`}>
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

        <Field label="Confirmar nova senha" htmlFor="confirmation">
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
        Salvar nova senha
      </Button>

      <div className="mt-2 flex justify-center">
        <Button asChild variant="link" size="sm">
          <Link href="/entrar">Voltar para o login</Link>
        </Button>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="h-9" />
          <p className="mt-2 text-[13px] text-[var(--ink-3)]">Gestão clínica veterinária</p>
        </div>
        <Suspense fallback={<div className="h-64" />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
      <footer className="safe-bottom px-5 pb-6 text-center text-[12px] text-[var(--ink-3)]">
        Dados clínicos protegidos. Nenhuma informação de paciente é guardada neste dispositivo.
      </footer>
    </main>
  );
}
