import { describe, expect, it } from 'vitest';
import {
  aggregateExamOrderStatus,
  appointmentStatusForEncounter,
  assertAppointmentTransition,
  assertEncounterTransition,
  assertEncounterWritable,
  assertExamItemTransition,
  assertPrescriptionTransition,
  canTransitionNote,
  isEncounterOpen,
} from './state-machines';
import { DomainError } from './errors';

describe('agendamento', () => {
  it('permite o caminho normal do balcão', () => {
    expect(() => assertAppointmentTransition('scheduled', 'confirmed')).not.toThrow();
    expect(() => assertAppointmentTransition('confirmed', 'checked_in')).not.toThrow();
    expect(() => assertAppointmentTransition('checked_in', 'in_service')).not.toThrow();
    expect(() => assertAppointmentTransition('in_service', 'completed')).not.toThrow();
  });

  it('recusa voltar de concluído', () => {
    expect(() => assertAppointmentTransition('completed', 'scheduled')).toThrow(DomainError);
    expect(() => assertAppointmentTransition('completed', 'checked_in')).toThrow(DomainError);
  });

  it('recusa falta depois do check-in', () => {
    expect(() => assertAppointmentTransition('checked_in', 'no_show')).toThrow(DomainError);
  });

  it('não deixa cancelado voltar a existir', () => {
    expect(() => assertAppointmentTransition('cancelled', 'scheduled')).toThrow(DomainError);
  });
});

describe('atendimento', () => {
  it('segue chegada, triagem, atendimento e finalização', () => {
    expect(() => assertEncounterTransition('arrived', 'triaged')).not.toThrow();
    expect(() => assertEncounterTransition('triaged', 'in_progress')).not.toThrow();
    expect(() => assertEncounterTransition('in_progress', 'on_hold')).not.toThrow();
    expect(() => assertEncounterTransition('on_hold', 'in_progress')).not.toThrow();
    expect(() => assertEncounterTransition('in_progress', 'finished')).not.toThrow();
  });

  it('permite reabrir um atendimento finalizado', () => {
    expect(() => assertEncounterTransition('finished', 'in_progress')).not.toThrow();
  });

  it('permite marcar como registrado por engano', () => {
    expect(() => assertEncounterTransition('finished', 'entered_in_error')).not.toThrow();
  });

  it('recusa transição inexistente', () => {
    expect(() => assertEncounterTransition('arrived', 'finished')).toThrow(DomainError);
    expect(() => assertEncounterTransition('cancelled', 'in_progress')).toThrow(DomainError);
  });

  it('bloqueia escrita em atendimento finalizado', () => {
    expect(() => assertEncounterWritable('in_progress')).not.toThrow();
    expect(() => assertEncounterWritable('triaged')).not.toThrow();
    expect(() => assertEncounterWritable('finished')).toThrow(DomainError);
    expect(() => assertEncounterWritable('cancelled')).toThrow(DomainError);
    expect(() => assertEncounterWritable('entered_in_error')).toThrow(DomainError);
  });

  it('sabe quais status contam como abertos', () => {
    expect(isEncounterOpen('arrived')).toBe(true);
    expect(isEncounterOpen('on_hold')).toBe(true);
    expect(isEncounterOpen('finished')).toBe(false);
  });

  it('espelha o status do atendimento na agenda', () => {
    expect(appointmentStatusForEncounter('in_progress')).toBe('in_service');
    expect(appointmentStatusForEncounter('finished')).toBe('completed');
    expect(appointmentStatusForEncounter('cancelled')).toBe('cancelled');
  });
});

describe('nota clínica', () => {
  it('rascunho pode ser assinado ou descartado', () => {
    expect(canTransitionNote('draft', 'final')).toBe(true);
    expect(canTransitionNote('draft', 'entered_in_error')).toBe(true);
  });

  it('nota assinada não volta a rascunho', () => {
    expect(canTransitionNote('final', 'draft')).toBe(false);
    expect(canTransitionNote('amended', 'draft')).toBe(false);
  });

  it('nota assinada admite retificação e marcação de erro', () => {
    expect(canTransitionNote('final', 'amended')).toBe(true);
    expect(canTransitionNote('final', 'entered_in_error')).toBe(true);
  });
});

describe('receita', () => {
  it('rascunho pode ser assinado', () => {
    expect(() => assertPrescriptionTransition('draft', 'signed')).not.toThrow();
  });

  it('receita assinada não volta a rascunho', () => {
    expect(() => assertPrescriptionTransition('signed', 'draft')).toThrow(DomainError);
  });

  it('receita assinada pode ser cancelada', () => {
    expect(() => assertPrescriptionTransition('signed', 'cancelled')).not.toThrow();
  });
});

describe('exame', () => {
  it('segue solicitação, coleta, envio e resultado', () => {
    expect(() => assertExamItemTransition('requested', 'collected')).not.toThrow();
    expect(() => assertExamItemTransition('collected', 'sent')).not.toThrow();
    expect(() => assertExamItemTransition('sent', 'in_progress')).not.toThrow();
    expect(() => assertExamItemTransition('in_progress', 'resulted')).not.toThrow();
    expect(() => assertExamItemTransition('resulted', 'reviewed')).not.toThrow();
  });

  it('não deixa item cancelado seguir adiante', () => {
    expect(() => assertExamItemTransition('cancelled', 'collected')).toThrow(DomainError);
  });

  it('agrega o status do pedido a partir dos itens', () => {
    expect(aggregateExamOrderStatus(['requested', 'requested'])).toBe('ordered');
    expect(aggregateExamOrderStatus(['resulted', 'requested'])).toBe('partially_resulted');
    expect(aggregateExamOrderStatus(['resulted', 'resulted'])).toBe('resulted');
    expect(aggregateExamOrderStatus(['reviewed', 'reviewed'])).toBe('reviewed');
    expect(aggregateExamOrderStatus(['cancelled', 'cancelled'])).toBe('cancelled');
  });

  it('ignora itens cancelados ao agregar', () => {
    expect(aggregateExamOrderStatus(['cancelled', 'resulted'])).toBe('resulted');
  });
});
