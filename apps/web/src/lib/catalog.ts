'use client';

import { useQuery } from '@tanstack/react-query';
import type { Breed, ExamCatalogItem, Professional, Service, Species } from '@chiron/contracts';
import { api } from './api';

/**
 * Catálogos mudam pouco: ficam em cache longo e são compartilhados por todas
 * as telas em vez de cada formulário buscar por conta própria.
 */
const LONG = { staleTime: 10 * 60_000, gcTime: 30 * 60_000 };

export function useSpecies() {
  return useQuery({
    queryKey: ['catalog', 'species'],
    queryFn: () => api.get<{ items: Species[] }>('/species'),
    select: (data) => data.items,
    ...LONG,
  });
}

export function useBreeds(speciesId: string | null | undefined) {
  return useQuery({
    queryKey: ['catalog', 'breeds', speciesId],
    queryFn: () => api.get<{ items: Breed[] }>('/breeds', { speciesId }),
    select: (data) => data.items,
    enabled: Boolean(speciesId),
    ...LONG,
  });
}

export function useServices() {
  return useQuery({
    queryKey: ['catalog', 'services'],
    queryFn: () => api.get<{ items: Service[] }>('/services'),
    select: (data) => data.items.filter((service) => service.active),
    ...LONG,
  });
}

export function useProfessionals() {
  return useQuery({
    queryKey: ['catalog', 'professionals'],
    queryFn: () => api.get<{ items: Professional[] }>('/professionals'),
    select: (data) => data.items.filter((professional) => professional.active),
    ...LONG,
  });
}

export function useExamCatalog(enabled = true) {
  return useQuery({
    queryKey: ['catalog', 'exams'],
    queryFn: () => api.get<{ items: ExamCatalogItem[] }>('/exam-catalog'),
    select: (data) => data.items,
    enabled,
    ...LONG,
  });
}

export interface ObservationCodeDto {
  code: string;
  name: string;
  valueKind: 'numeric' | 'text' | 'code';
  canonicalUom: string | null;
  allowedUoms: string[];
  allowedCodes: string[];
  scale: string | null;
  sort: number;
}

export function useObservationCodes() {
  return useQuery({
    queryKey: ['catalog', 'observation-codes'],
    queryFn: () => api.get<{ items: ObservationCodeDto[] }>('/observation-codes'),
    select: (data) => data.items,
    ...LONG,
  });
}

export function useFacilities() {
  return useQuery({
    queryKey: ['catalog', 'facilities'],
    queryFn: () => api.get<{ items: Array<{ id: string; name: string; kind: string; isDefault: boolean }> }>('/facilities'),
    select: (data) => data.items,
    ...LONG,
  });
}
