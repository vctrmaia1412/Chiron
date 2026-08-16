'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Keyboard, ScanLine } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Sheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

interface ScanResult {
  kind: 'patient' | 'guardian' | 'unknown';
  id?: string;
  label?: string;
  href?: string;
  parsed: { kind: string; raw: string; gtin?: string; lot?: string; expiry?: string; serial?: string };
}

/**
 * Leitura de código sem depender de aplicativo nativo.
 *
 * O campo aceita três origens sem distinção: leitor USB ou Bluetooth (que se
 * comporta como teclado e termina com Enter), digitação manual e câmera, via
 * BarcodeDetector quando o navegador oferece. A interpretação do conteúdo é
 * do servidor, então nenhuma dessas origens muda a regra.
 */
export function ScanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [code, setCode] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(false);

  useEffect(() => {
    setCameraSupported(
      typeof window !== 'undefined' &&
        'BarcodeDetector' in window &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setCode('');
      setResult(null);
      setError(null);
    } else {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const DetectorCtor = (window as unknown as { BarcodeDetector: new (opts?: unknown) => {
        detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
      } }).BarcodeDetector;
      const detector = new DetectorCtor({
        formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'code_39', 'itf', 'data_matrix'],
      });

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const first = codes[0]?.rawValue;
          if (first) {
            stopCamera();
            setCode(first);
            void resolve(first);
            return;
          }
        } catch {
          // frame sem leitura, segue tentando
        }
        requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      setError('Não foi possível acessar a câmera. Use o leitor ou digite o código.');
      stopCamera();
    }
  }

  async function resolve(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.post<ScanResult>('/search/scan', { code: value });
      setResult(response);
      if (response.href) {
        onOpenChange(false);
        router.push(response.href);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ler código"
      description="Microchip, brinco, etiqueta de produto ou código interno."
      size="sm"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void resolve(code);
        }}
      >
        <div className="relative">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input
            ref={inputRef}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Aponte o leitor ou digite o código"
            autoComplete="off"
            className="pl-9"
          />
        </div>
        <p className="mt-1.5 text-[12.5px] text-[var(--ink-3)]">
          Leitores USB e Bluetooth funcionam como teclado: basta o campo estar em foco.
        </p>

        <div className="mt-4 flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">
            <ScanLine className="h-4 w-4" />
            Localizar
          </Button>
          {cameraSupported && !cameraOn && (
            <Button type="button" variant="secondary" onClick={() => void startCamera()}>
              <Camera className="h-4 w-4" />
              Câmera
            </Button>
          )}
        </div>
      </form>

      {cameraOn && (
        <div className="mt-4 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-black">
          <video ref={videoRef} className="h-56 w-full object-cover" playsInline muted />
          <div className="flex items-center justify-between bg-[var(--surface)] px-3 py-2">
            <span className="text-[12.5px] text-[var(--ink-3)]">Procurando código...</span>
            <button type="button" onClick={stopCamera} className="text-[13px] text-[var(--brand)]">
              Parar
            </button>
          </div>
        </div>
      )}

      {!cameraSupported && (
        <p className="mt-3 rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--ink-3)]">
          Este navegador não expõe leitura por câmera. O leitor físico e a digitação continuam funcionando.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}

      {result && result.kind === 'unknown' && (
        <div className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
          <p className="text-[13.5px] font-medium text-[var(--ink)]">Código lido, sem vínculo no cadastro</p>
          <dl className="mt-2 space-y-1 text-[12.5px] text-[var(--ink-2)]">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ink-3)]">Conteúdo</dt>
              <dd className="truncate font-mono">{result.parsed.raw}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ink-3)]">Formato</dt>
              <dd>{result.parsed.kind}</dd>
            </div>
            {result.parsed.lot && (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-3)]">Lote</dt>
                <dd>{result.parsed.lot}</dd>
              </div>
            )}
            {result.parsed.expiry && (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-3)]">Validade</dt>
                <dd>{result.parsed.expiry}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </Sheet>
  );
}
