'use client';

import { useCallback, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ApiError, api, errorMessage } from '@/lib/api';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

/**
 * Ações sensíveis exigem reautenticação recente. Em vez de espalhar essa
 * lógica por cada tela, o hook executa a ação, e se o servidor responder
 * STEP_UP_REQUIRED, pede a senha e repete a ação uma única vez.
 */
export function useStepUp() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const pending = useRef<(() => Promise<unknown>) | null>(null);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'STEP_UP_REQUIRED') {
        pending.current = action;
        setPassword('');
        setError(null);
        setOpen(true);
        return;
      }
      throw caught;
    }
  }, []);

  async function confirm() {
    setChecking(true);
    setError(null);
    try {
      await api.post('/auth/step-up', { password });
      const action = pending.current;
      pending.current = null;
      setOpen(false);
      setPassword('');
      if (action) await action();
    } catch (caught) {
      setError(errorMessage(caught, 'Senha incorreta.'));
    } finally {
      setChecking(false);
    }
  }

  const dialog = (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) pending.current = null;
      }}
      title="Confirme sua senha"
      description="Esta ação é sensível e exige reautenticação."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => setOpen(false)} className="sm:w-auto">
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
