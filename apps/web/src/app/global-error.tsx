'use client';

import Link from 'next/link';

import { LogoMark } from '@/components/brand/logo';

/**
 * Último anteparo: substitui o layout raiz, monta o próprio documento e não
 * recebe a folha de estilo do app. Por isso o mínimo da identidade viaja aqui
 * dentro, e a volta ao painel é recarga completa, não navegação do roteador.
 */
const FALLBACK_STYLE = `
:root { --brand: #0f766e; }
body.chiron-fallback {
  margin: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 40px 20px;
  background: #f6f8f8;
  color: #10201f;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  text-align: center;
}
.chiron-fallback svg { width: 44px; height: 44px; }
.chiron-fallback h1 { margin: 0; font-size: 19px; font-weight: 600; }
.chiron-fallback p { margin: 0; max-width: 30rem; font-size: 14px; color: #40514f; }
.chiron-fallback code {
  padding: 6px 10px;
  border-radius: 7px;
  background: #eef3f2;
  font-size: 12.5px;
  color: #5c706d;
}
.chiron-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 6px; }
.chiron-actions button,
.chiron-actions a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 10px;
  border: 0;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  background: #0f766e;
  color: #ffffff;
}
.chiron-actions .chiron-secondary {
  border: 1px solid #c6d3d0;
  background: #ffffff;
  color: #10201f;
}
`;

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="chiron-fallback">
        <title>Erro · CHIRON</title>
        <style>{FALLBACK_STYLE}</style>

        <LogoMark />
        <h1>Não foi possível abrir o CHIRON</h1>
        <p>
          Houve uma falha inesperada ao carregar a aplicação. Nada do que já foi registrado se perdeu: tente de novo
          em instantes.
        </p>

        {error.digest && <code>Informe este código ao suporte: {error.digest}</code>}

        <div className="chiron-actions">
          <button type="button" onClick={() => retry()}>
            Tentar novamente
          </button>
          <Link className="chiron-secondary" href="/">
            Ir para o painel
          </Link>
        </div>
      </body>
    </html>
  );
}
