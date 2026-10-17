'use client';

import { useEffect, useState } from 'react';

/**
 * Valor que só muda depois de uma pausa. Busca e conferência que dependem do
 * que está sendo digitado esperam o veterinário parar, em vez de disparar uma
 * requisição por tecla.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
