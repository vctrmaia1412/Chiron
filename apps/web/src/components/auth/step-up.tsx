'use client';

import { useCallback, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ApiError, api, errorMessage } from '@/lib/api';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

type PendingAction = {
  action: () => Promise<unknown>;
  resolve: (done: boolean) => void;
  reject: (error: unknown) => void;
};

/**
 * Ações sensíveis exigem reautenticação recente. Em vez de espalhar essa
 * lógica por cada tela, o hook executa a ação, e se o servidor responder
 * STEP_UP_REQUIRED, pede a senha e repete a ação uma única vez.
 *
 * `run` só termina quando a ação termina: `true` se ela foi feita, `false`
 * se a pessoa desistiu na senha. Erro da ação chega a quem chamou, para a
 * tela não mostrar "feito" antes da hora.
 */
export function useStepUp() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const pending = useRef<PendingAction | null>(null);

  const run = useCallback(
    (action: () => Promise<unknown>) =>
      new Promise<boolean>((resolve, reject) => {
        action().then(
          () => resolve(true),
          (caught: unknown) => {
            if (caught instanceof ApiError && caught.code === 'STEP_UP_REQUIRED') {
              pending.current = { action, resolve, reject };
              setPassword('');
              setError(null);
              setOpen(true);
              return;
            }
            reject(caught);
          },
        );
      }),
    [],
  );

  function abandon() {
    pending.current?.resolve(false);
    pending.current = null;
    setOpen(false);
  }

  async function confirm() {
    const current = pending.current;
    if (!current) return;
    setChecking(true);
    setError(null);
    try {
      await api.post('/auth/step-up', { password });
    } catch (caught) {
      setError(errorMessage(caught, 'Senha incorreta.'));
      setChecking(false);
      return;
    }
    pending.current = null;
    setOpen(false);
    setPassword('');
    try {
      await current.action();
      current.resolve(true);
    } catch (caught) {
      current.reject(caught);
    } finally {
      setChecking(false);
    }
  }

  const dialog = (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) abandon();
      }}
      title="Confirme sua senha"
      description="Esta ação é sensível e exige reautenticação."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={abandon} className="sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={() => void confirm()} loading={checking} className="sm:w-auto">
            <ShieldCheck className="h-4 w-4" />
            Confirmar
          </Button>
        </>
      }
    >
      <Field label="Senha" error={error}>
        <Input
          autoFocus
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void confirm();
          }}
        />
      </Field>
    </Sheet>
  );

  return { run, dialog };
}
