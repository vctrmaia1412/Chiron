'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { BRAZILIAN_STATES, signupRequestSchema, type LoginResponse } from '@chiron/contracts';
import { ApiError, api, errorMessage, setActiveTenantId } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Logo } from '@/components/brand/logo';

type Errors = Partial<Record<string, string>>;

/**
 * Criar conta: o veterinário abre a própria clínica sozinho e cai direto no
 * sistema. Poucos campos, só o que o sistema precisa no primeiro dia; o resto
 * (endereço, logotipo, equipe) fica para depois, em Configurações.
 */
function SignupForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [clinicName, setClinicName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [isVeterinarian, setIsVeterinarian] = useState(true);
  const [councilNumber, setCouncilNumber] = useState('');
  const [councilState, setCouncilState] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setEmailTaken(false);

    const payload = {
      name,
      email,
      password,
      clinicName,
      city: city.trim() || undefined,
      state: state || undefined,
      isVeterinarian,
      councilNumber: isVeterinarian ? councilNumber.trim() || undefined : undefined,
      councilState: isVeterinarian ? councilState || undefined : undefined,
      acceptTerms,
      website: website || undefined,
    };
    const checked = signupRequestSchema.safeParse(payload);
    if (!checked.success) {
      const next: Errors = {};
      for (const issue of checked.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        next[key] ??= issue.message;
      }
      setErrors(next);
      document.getElementById(Object.keys(next)[0] ?? '')?.focus();
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const response = await api.post<LoginResponse>('/auth/signup', payload);
      setActiveTenantId(response.activeTenantId);
      queryClient.clear();
      router.replace('/?bemvindo=1');
    } catch (caught) {
      if (caught instanceof ApiError) {
        const details = caught.details as { reason?: string } | undefined;
        if (details?.reason === 'email_taken') {
          setEmailTaken(true);
          setErrors({ email: 'Este e-mail já tem conta.' });
        } else if (caught.fieldIssues.length > 0) {
          setErrors(Object.fromEntries(caught.fieldIssues.map((issue) => [issue.path, issue.message])));
        } else {
          setFormError(errorMessage(caught));
        }
      } else {
        setFormError(errorMessage(caught, 'Não foi possível criar a conta.'));
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md" noValidate>
      <h1 className="text-lg font-semibold text-[var(--ink)]">Criar conta grátis</h1>
      <p className="mt-1 text-sm text-[var(--ink-3)]">
        Sua clínica fica pronta em um minuto, já com os serviços mais comuns. Equipe e preços você ajusta depois.
      </p>

      <div className="mt-6 space-y-4">
        <Field label="Seu nome" required error={errors.name}>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Dra. Ana Souza"
          />
        </Field>

        <Field label="E-mail" required error={errors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@clinica.com.br"
          />
        </Field>
        {emailTaken && (
          <p className="-mt-2 text-[13px] text-[var(--ink-2)]">
            <Link href="/entrar" className="font-medium text-[var(--brand)]">
              Entrar com esse e-mail
            </Link>{' '}
            ou{' '}
            <Link href="/esqueci-senha" className="font-medium text-[var(--brand)]">
              recuperar a senha
            </Link>
            .
          </p>
        )}

        <Field label="Senha" required htmlFor="password" error={errors.password} hint="Pelo menos 10 caracteres.">
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={errors.password ? true : undefined}
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

        <Field label="Nome da clínica" required error={errors.clinicName}>
          <Input
            id="clinicName"
            value={clinicName}
            onChange={(event) => setClinicName(event.target.value)}
            placeholder="Clínica Veterinária São Francisco"
          />
        </Field>

        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <Field label="Cidade">
            <Input id="city" autoComplete="address-level2" value={city} onChange={(event) => setCity(event.target.value)} />
          </Field>
          <Field label="UF">
            <Select id="state" value={state} onChange={(event) => setState(event.target.value)}>
              <option value="">—</option>
              {BRAZILIAN_STATES.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Checkbox
          checked={isVeterinarian}
          onChange={(event) => setIsVeterinarian(event.target.checked)}
          label="Sou médico(a)-veterinário(a) e vou atender pelo sistema"
        />

        {isVeterinarian && (
          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
            <Field
              label="Número do CRMV"
              required
              error={errors.councilNumber}
              hint={errors.councilNumber ? undefined : 'Sai na receita e no prontuário assinados.'}
            >
              <Input
                id="councilNumber"
                inputMode="numeric"
                value={councilNumber}
                onChange={(event) => setCouncilNumber(event.target.value)}
              />
            </Field>
            <Field label="UF do CRMV" required error={errors.councilState}>
              <Select id="councilState" value={councilState} onChange={(event) => setCouncilState(event.target.value)}>
                <option value="">—</option>
                {BRAZILIAN_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {/* Campo-isca: fica fora da tela e do leitor de tela; só robô preenche. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="website">Site</label>
          <input
            id="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>

        <div className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-3">
          <p className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">
            O CHIRON está em <strong>piloto gratuito</strong>. Os dados ficam em servidor no Brasil, com cópia de
            segurança diária cifrada. Você é responsável pelos dados dos seus clientes e pode pedir a exportação ou a
            exclusão a qualquer momento. Funções podem mudar durante o piloto.
          </p>
          <div className="mt-2">
            <Checkbox
              id="acceptTerms"
              checked={acceptTerms}
              onChange={(event) => setAcceptTerms(event.target.checked)}
              label="Li e concordo com as condições do piloto"
            />
          </div>
          {errors.acceptTerms && <p className="mt-1 text-[12.5px] text-[var(--danger)]">{errors.acceptTerms}</p>}
        </div>
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
        Criar minha clínica
      </Button>

      <p className="mt-4 text-center text-[13.5px] text-[var(--ink-2)]">
        Já tem conta?{' '}
        <Link href="/entrar" className="font-medium text-[var(--brand)]">
          Entrar
        </Link>
      </p>
    </form>
  );
}

export default function SignupPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="h-9" />
          <p className="mt-2 text-[13px] text-[var(--ink-3)]">Gestão clínica veterinária</p>
        </div>
        <SignupForm />
      </div>
    </main>
  );
}
