'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  ConditionSuggestion,
  MedicationSuggestion,
  NoteTemplate,
  PatientClinicalSummary,
  PatientProtocolSuggestion,
  PrescriptionTemplate,
} from '@chiron/contracts';
import { api } from './api';

/**
 * Consultas do registro rápido. Modelos e protocolos mudam pouco e ficam em
 * cache longo; sugestões de busca ficam em cache curto e só disparam com
 * texto, para não fazer requisição a cada tecla vazia.
 */
const LONG = { staleTime: 10 * 60_000, gcTime: 30 * 60_000 };

export function useNoteTemplates(speciesId: string | null | undefined) {
  return useQuery({
    queryKey: ['note-templates', speciesId ?? 'all'],
    queryFn: () => api.get<{ items: NoteTemplate[] }>('/note-templates', { speciesId: speciesId ?? undefined }),
    select: (data) => data.items,
    ...LONG,
  });
}

export function usePatientSummary(patientId: string | null | undefined, excludeEncounterId?: string) {
  return useQuery({
    queryKey: ['patient-summary', patientId, excludeEncounterId ?? null],
    queryFn: () =>
      api.get<PatientClinicalSummary>(`/patients/${patientId}/clinical-summary`, { excludeEncounterId }),
    enabled: Boolean(patientId),
    staleTime: 30_000,
  });
}

export function useConditionSearch(query: string, speciesId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['conditions', speciesId ?? 'all', query],
    queryFn: () =>
      api.get<{ items: ConditionSuggestion[] }>('/conditions', { q: query, speciesId: speciesId ?? undefined }),
    select: (data) => data.items,
    enabled,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useMedicationSuggestions(query: string, speciesId: string | null | undefined) {
  return useQuery({
    queryKey: ['medication-suggestions', speciesId ?? 'all', query],
    queryFn: () =>
      api.get<{ items: MedicationSuggestion[] }>('/medication-suggestions', {
        q: query,
        speciesId: speciesId ?? undefined,
      }),
    select: (data) => data.items,
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

export function usePrescriptionTemplates(speciesId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['prescription-templates', speciesId ?? 'all'],
    queryFn: () =>
      api.get<{ items: PrescriptionTemplate[] }>('/prescription-templates', { speciesId: speciesId ?? undefined }),
    select: (data) => data.items,
    enabled,
    ...LONG,
  });
}

export function useVaccineProtocols(patientId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['vaccine-protocols', patientId],
    queryFn: () => api.get<{ items: PatientProtocolSuggestion[] }>('/vaccine-protocols', { patientId }),
    select: (data) => data.items,
    enabled: enabled && Boolean(patientId),
    staleTime: 30_000,
  });
}
