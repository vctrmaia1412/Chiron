'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Ditado pelo reconhecimento de fala do próprio navegador (Chrome, Edge,
 * Safari e o Chrome do Android). Sem custo e sem servidor nosso no caminho.
 * O áudio é processado pelo serviço de fala do navegador, então a tela avisa
 * isso antes do primeiro uso; o texto só entra no prontuário depois que o
 * veterinário vê e salva.
 */
interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => undefined;

/** Primeira letra maiúscula e ponto final: a fala chega sem pontuação. */
export function tidyDictation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const capitalized = trimmed.charAt(0).toLocaleUpperCase('pt-BR') + trimmed.slice(1);
  return /[.!?:;]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export function useDictation(onText: (text: string) => void) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => recognitionCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onText);

  useEffect(() => {
    callback.current = onText;
  });

  useEffect(
    () => () => {
      recognition.current?.abort();
    },
    [],
  );

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    recognition.current?.abort();

    const instance = new Ctor();
    instance.lang = 'pt-BR';
    instance.continuous = true;
    instance.interimResults = false;
    instance.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) {
          const text = tidyDictation(result[0].transcript);
          if (text) callback.current(text);
        }
      }
    };
    instance.onerror = (event) => {
      setError(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'O navegador bloqueou o microfone. Libere o acesso nas configurações do site.'
          : event.error === 'no-speech'
            ? null
            : 'O ditado parou. Toque no microfone para continuar.',
      );
    };
    instance.onend = () => {
      setListening(false);
      recognition.current = null;
    };

    recognition.current = instance;
    setError(null);
    setListening(true);
    instance.start();
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, error, start, stop, toggle };
}
