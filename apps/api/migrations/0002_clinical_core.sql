-- =============================================================================
-- CHIRON | Migração 0002 - Núcleo clínico
-- registry (tutores, espécies, pacientes, serviços), scheduling, clinical,
-- lab, immunization, documents, charge_items e estoque mínimo.
-- Referência: docs/CHIRON_MASTER_ANALYSIS.md, seções 9.3 a 9.11.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS scheduling;
CREATE SCHEMA IF NOT EXISTS clinical;
CREATE SCHEMA IF NOT EXISTS lab;
CREATE SCHEMA IF NOT EXISTS immunization;
CREATE SCHEMA IF NOT EXISTS documents;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS inventory;

-- ============================================================== registry
CREATE TABLE registry.guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  number bigint NOT NULL,
  person_type text NOT NULL DEFAULT 'individual' CHECK (person_type IN ('individual', 'company')),
  name text NOT NULL,
  legal_name text,
  document_kind text NOT NULL DEFAULT 'none' CHECK (document_kind IN ('cpf', 'cnpj', 'passport', 'none')),
  document_encrypted text,
  document_hash text,
  document_masked text,
  email citext,
  phone_primary text,
  phone_secondary text,
  birth_date date,
  address jsonb,
  notes text,
  tags text[] NOT NULL DEFAULT '{}',
  merged_into_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number)
);
CREATE UNIQUE INDEX guardians_document_uq
  ON registry.guardians (tenant_id, document_hash)
  WHERE document_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX guardians_name_trgm ON registry.guardians USING gin (name gin_trgm_ops);
CREATE INDEX guardians_phone_idx ON registry.guardians (tenant_id, phone_primary) WHERE deleted_at IS NULL;
CREATE INDEX guardians_tenant_idx ON registry.guardians (tenant_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE registry.species (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name_pt text NOT NULL,
  name_scientific text,
  taxon_class text NOT NULL CHECK (taxon_class IN ('mammal', 'bird', 'reptile', 'amphibian', 'fish', 'other')),
  category text NOT NULL CHECK (category IN ('companion', 'equine', 'livestock', 'wild', 'exotic')),
  default_weight_uom text NOT NULL DEFAULT 'kg' CHECK (default_weight_uom IN ('kg', 'g', 'lb')),
  supports_group boolean NOT NULL DEFAULT false,
  requires_scientific_name boolean NOT NULL DEFAULT false,
  observation_panel text[] NOT NULL DEFAULT '{}',
  attribute_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, code)
);

CREATE TABLE registry.breeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  species_id uuid NOT NULL REFERENCES registry.species(id) ON DELETE CASCADE,
  name text NOT NULL,
  size_class text CHECK (size_class IN ('toy', 'small', 'medium', 'large', 'giant')),
  active boolean NOT NULL DEFAULT true,
  UNIQUE NULLS NOT DISTINCT (tenant_id, species_id, name)
);
CREATE INDEX breeds_species_idx ON registry.breeds (species_id);

CREATE TABLE registry.reference_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  species_id uuid NOT NULL REFERENCES registry.species(id) ON DELETE CASCADE,
  breed_id uuid REFERENCES registry.breeds(id) ON DELETE CASCADE,
  parameter_code text NOT NULL,
  life_stage text CHECK (life_stage IN ('puppy', 'adult', 'senior')),
  sex text CHECK (sex IN ('male', 'female', 'unknown')),
  weight_min_kg numeric(9,4),
  weight_max_kg numeric(9,4),
  min_value numeric(12,4),
  max_value numeric(12,4),
  uom text NOT NULL,
  source text,
  validation_status text NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_status IN ('unvalidated', 'validated')),
  validated_by uuid,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reference_ranges_lookup_idx ON registry.reference_ranges (species_id, parameter_code);

CREATE TABLE clinical.observation_codes (
  code text PRIMARY KEY,
  name text NOT NULL,
  value_kind text NOT NULL CHECK (value_kind IN ('numeric', 'text', 'code')),
  canonical_uom text,
  allowed_uoms text[] NOT NULL DEFAULT '{}',
  allowed_codes text[] NOT NULL DEFAULT '{}',
  scale text,
  sort integer NOT NULL DEFAULT 0
);

CREATE TABLE registry.service_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('consultation', 'return', 'vaccination', 'preventive',
    'exam', 'procedure', 'surgery', 'hospital_day', 'grooming', 'telehealth', 'other')),
  default_duration_min integer NOT NULL DEFAULT 30,
  default_price numeric(14,2),
  tax_code text,
  requires_professional boolean NOT NULL DEFAULT true,
  requires_resource boolean NOT NULL DEFAULT false,
  color text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, key)
);

CREATE TABLE registry.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  number bigint NOT NULL,
  name text NOT NULL,
  species_id uuid NOT NULL REFERENCES registry.species(id),
  breed_id uuid REFERENCES registry.breeds(id),
  breed_free_text text,
  sex text NOT NULL DEFAULT 'unknown' CHECK (sex IN ('male', 'female', 'unknown')),
  reproductive_status text NOT NULL DEFAULT 'unknown'
    CHECK (reproductive_status IN ('intact', 'neutered', 'spayed', 'unknown')),
  birth_date date,
  birth_date_precision text CHECK (birth_date_precision IN ('exact', 'month', 'year', 'estimated')),
  estimated_age_months integer,
  color_markings text,
  size_class text,
  current_weight_kg numeric(9,4),
  current_weight_at timestamptz,
  photo_document_id uuid, -- FK adiada (documents.documents)
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'deceased', 'transferred')),
  no_known_allergies boolean NOT NULL DEFAULT false,
  no_known_allergies_at timestamptz,
  no_known_allergies_by uuid,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  internal_code text,
  merged_into_id uuid,
  origin_facility_id uuid,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number)
);
CREATE INDEX patients_name_trgm ON registry.patients USING gin (name gin_trgm_ops);
CREATE INDEX patients_tenant_status_idx ON registry.patients (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX patients_species_idx ON registry.patients (tenant_id, species_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX patients_internal_code_uq
  ON registry.patients (tenant_id, internal_code)
  WHERE internal_code IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE registry.patient_guardians (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'owner'
    CHECK (role IN ('owner', 'co_owner', 'financial_responsible', 'authorized_contact', 'caretaker', 'institution')),
  is_primary boolean NOT NULL DEFAULT false,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, patient_id, guardian_id, role),
  CONSTRAINT patient_guardians_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT patient_guardians_guardian_fk
    FOREIGN KEY (tenant_id, guardian_id) REFERENCES registry.guardians (tenant_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX patient_guardians_primary_uq
  ON registry.patient_guardians (tenant_id, patient_id)
  WHERE is_primary AND valid_to IS NULL;
CREATE INDEX patient_guardians_guardian_idx ON registry.patient_guardians (tenant_id, guardian_id);

CREATE TABLE registry.patient_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  scheme text NOT NULL CHECK (scheme IN ('microchip', 'ear_tag', 'sisbov', 'leg_band', 'passport',
    'registry', 'tattoo', 'license', 'internal')),
  value text NOT NULL,
  issuer text,
  issued_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_identifiers_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, scheme, value)
);
CREATE INDEX patient_identifiers_value_trgm ON registry.patient_identifiers USING gin (value gin_trgm_ops);

CREATE TABLE registry.patient_allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  substance text NOT NULL,
  active_ingredient_normalized text NOT NULL,
  product_id uuid, -- FK adiada (inventory.products)
  reaction text,
  severity text NOT NULL DEFAULT 'unknown' CHECK (severity IN ('mild', 'moderate', 'severe', 'unknown')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'refuted')),
  noted_at timestamptz NOT NULL DEFAULT now(),
  noted_by uuid,
  source_encounter_id uuid,
  CONSTRAINT patient_allergies_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX patient_allergies_active_idx
  ON registry.patient_allergies (tenant_id, patient_id) WHERE status = 'active';

CREATE TABLE registry.patient_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('aggressive', 'contagious', 'financial_block', 'special_diet', 'no_guardian', 'other')),
  message text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_alerts_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX patient_alerts_active_idx ON registry.patient_alerts (tenant_id, patient_id) WHERE active;

CREATE TABLE registry.patient_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  condition_id uuid,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'chronic')),
  onset_at timestamptz,
  resolved_at timestamptz,
  source_encounter_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_problems_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id) ON DELETE CASCADE
);

-- ============================================================ scheduling
CREATE TABLE scheduling.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('room', 'operating_room', 'equipment', 'vehicle')),
  name text NOT NULL,
  capacity integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT resources_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES platform.facilities (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE scheduling.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  professional_id uuid,
  resource_id uuid,
  slot_minutes integer NOT NULL DEFAULT 30,
  working_hours jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid_from date,
  valid_until date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedules_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES platform.facilities (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT schedules_professional_fk
    FOREIGN KEY (tenant_id, professional_id) REFERENCES registry.professionals (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE scheduling.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  professional_id uuid,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  CONSTRAINT schedule_blocks_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES platform.facilities (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX schedule_blocks_idx ON scheduling.schedule_blocks (tenant_id, facility_id, start_at);

CREATE TABLE scheduling.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  number bigint NOT NULL,
  patient_id uuid,
  guardian_id uuid,
  professional_id uuid,
  resource_id uuid,
  service_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'checked_in', 'in_service', 'completed', 'no_show', 'cancelled', 'rescheduled')),
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'priority', 'urgent')),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text,
  notes text,
  source text NOT NULL DEFAULT 'staff'
    CHECK (source IN ('staff', 'portal', 'phone', 'whatsapp', 'walk_in', 'api')),
  confirmed_at timestamptz,
  confirmation_channel text,
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  rescheduled_from_id uuid,
  origin_encounter_id uuid,
  encounter_id uuid,
  allow_overlap boolean NOT NULL DEFAULT false,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CHECK (end_at > start_at),
  CHECK (patient_id IS NOT NULL OR guardian_id IS NOT NULL),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT appointments_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES platform.facilities (tenant_id, id),
  CONSTRAINT appointments_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id),
  CONSTRAINT appointments_guardian_fk
    FOREIGN KEY (tenant_id, guardian_id) REFERENCES registry.guardians (tenant_id, id),
  CONSTRAINT appointments_professional_fk
    FOREIGN KEY (tenant_id, professional_id) REFERENCES registry.professionals (tenant_id, id),
  CONSTRAINT appointments_service_fk
    FOREIGN KEY (tenant_id, service_id) REFERENCES registry.service_catalog (tenant_id, id)
);
CREATE INDEX appointments_agenda_idx ON scheduling.appointments (tenant_id, facility_id, start_at);
CREATE INDEX appointments_professional_idx ON scheduling.appointments (tenant_id, professional_id, start_at);
CREATE INDEX appointments_patient_idx ON scheduling.appointments (tenant_id, patient_id, start_at DESC);
CREATE INDEX appointments_status_idx ON scheduling.appointments (tenant_id, status, start_at);

-- Impede sobreposição no mesmo profissional, salvo overbooking explícito.
ALTER TABLE scheduling.appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    professional_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (professional_id IS NOT NULL AND allow_overlap = false
         AND status IN ('scheduled', 'confirmed', 'checked_in', 'in_service'));

CREATE TABLE scheduling.appointment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  CONSTRAINT appt_history_fk
    FOREIGN KEY (tenant_id, appointment_id) REFERENCES scheduling.appointments (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX appt_history_idx ON scheduling.appointment_status_history (tenant_id, appointment_id, changed_at);

-- ============================================================== clinical
CREATE TABLE clinical.conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  code text,
  code_system text NOT NULL DEFAULT 'internal' CHECK (code_system IN ('venom', 'snomed_vet', 'internal')),
  name text NOT NULL,
  species_scope uuid[],
  active boolean NOT NULL DEFAULT true,
  UNIQUE NULLS NOT DISTINCT (tenant_id, code_system, code)
);
CREATE INDEX conditions_name_trgm ON clinical.conditions USING gin (name gin_trgm_ops);

CREATE TABLE clinical.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  number bigint NOT NULL,
  patient_id uuid NOT NULL,
  appointment_id uuid,
  service_id uuid,
  care_episode_id uuid,
  follow_up_of_encounter_id uuid,
  class text NOT NULL DEFAULT 'outpatient'
    CHECK (class IN ('outpatient', 'emergency', 'inpatient', 'surgery', 'home_visit', 'field', 'telehealth')),
  status text NOT NULL DEFAULT 'arrived'
    CHECK (status IN ('arrived', 'triaged', 'in_progress', 'on_hold', 'finished', 'cancelled', 'entered_in_error')),
  attending_professional_id uuid,
  arrived_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  chief_complaint text,
  weight_kg numeric(9,4),
  primary_diagnosis_summary text,
  disposition text CHECK (disposition IN ('discharged', 'referred', 'admitted', 'deceased', 'transferred')),
  referral jsonb,
  follow_up_due_at date,
  follow_up_reason text,
  follow_up_appointment_id uuid,
  cancel_reason text,
  finished_by uuid,
  finished_at timestamptz,
  integrity_hash text,
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_reason text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CHECK (status <> 'finished' OR ended_at IS NOT NULL),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT encounters_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES platform.facilities (tenant_id, id),
  CONSTRAINT encounters_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id),
  CONSTRAINT encounters_appointment_fk
    FOREIGN KEY (tenant_id, appointment_id) REFERENCES scheduling.appointments (tenant_id, id),
  CONSTRAINT encounters_service_fk
    FOREIGN KEY (tenant_id, service_id) REFERENCES registry.service_catalog (tenant_id, id),
  CONSTRAINT encounters_professional_fk
    FOREIGN KEY (tenant_id, attending_professional_id) REFERENCES registry.professionals (tenant_id, id)
);
CREATE UNIQUE INDEX encounters_active_per_appointment_uq
  ON clinical.encounters (tenant_id, appointment_id)
  WHERE appointment_id IS NOT NULL AND status IN ('arrived', 'triaged', 'in_progress', 'on_hold');
CREATE INDEX encounters_patient_idx ON clinical.encounters (tenant_id, patient_id, created_at DESC);
CREATE INDEX encounters_open_idx ON clinical.encounters (tenant_id, facility_id, status)
  WHERE status IN ('arrived', 'triaged', 'in_progress', 'on_hold');
CREATE INDEX encounters_followup_idx ON clinical.encounters (tenant_id, follow_up_due_at)
  WHERE follow_up_due_at IS NOT NULL AND follow_up_appointment_id IS NULL;

CREATE TABLE clinical.encounter_participants (
  encounter_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('attending', 'assistant', 'nurse', 'student', 'anesthetist')),
  from_at timestamptz NOT NULL DEFAULT now(),
  to_at timestamptz,
  PRIMARY KEY (encounter_id, professional_id, role),
  CONSTRAINT encounter_participants_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE clinical.note_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  species_id uuid REFERENCES registry.species(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  body_default text,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE clinical.encounter_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('triage', 'chief_complaint', 'history', 'physical_exam', 'assessment',
    'plan', 'progress', 'nursing', 'procedure_note', 'anesthesia_note', 'discharge_summary', 'addendum', 'free')),
  title text,
  body text NOT NULL DEFAULT '',
  body_format text NOT NULL DEFAULT 'plain' CHECK (body_format IN ('plain', 'markdown', 'json')),
  structured jsonb,
  template_id uuid REFERENCES clinical.note_templates(id),
  author_professional_id uuid,
  author_user_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'amended', 'entered_in_error')),
  status_reason text,
  signed_at timestamptz,
  signed_by uuid,
  supersedes_note_id uuid,
  superseded_by_note_id uuid,
  superseded_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  sequence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'entered_in_error') OR signed_at IS NOT NULL),
  UNIQUE (tenant_id, id),
  CONSTRAINT encounter_notes_encounter_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT encounter_notes_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id)
);
CREATE INDEX encounter_notes_encounter_idx ON clinical.encounter_notes (tenant_id, encounter_id, kind);
CREATE INDEX encounter_notes_patient_idx ON clinical.encounter_notes (tenant_id, patient_id, occurred_at DESC);
-- Uma nota por tipo por atendimento enquanto estiver em rascunho ativo
CREATE UNIQUE INDEX encounter_notes_active_kind_uq
  ON clinical.encounter_notes (tenant_id, encounter_id, kind)
  WHERE status IN ('draft', 'final') AND superseded_by_note_id IS NULL
    AND kind NOT IN ('progress', 'addendum', 'free', 'nursing', 'procedure_note');

-- Trigger validador de transição: nota assinada nunca é reescrita.
CREATE OR REPLACE FUNCTION clinical.validate_note_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'final' AND NEW.status = 'amended' THEN
    IF NEW.body IS DISTINCT FROM OLD.body
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.structured IS DISTINCT FROM OLD.structured
       OR NEW.author_professional_id IS DISTINCT FROM OLD.author_professional_id
       OR NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
      RAISE EXCEPTION 'Nota assinada só pode receber supersessão, não alteração de conteúdo'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'final' AND NEW.status = 'entered_in_error' THEN
    IF NEW.body IS DISTINCT FROM OLD.body THEN
      RAISE EXCEPTION 'Nota marcada como erro não pode ter o conteúdo alterado'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transição de nota inválida: % para %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER encounter_notes_transition
  BEFORE UPDATE ON clinical.encounter_notes
  FOR EACH ROW EXECUTE FUNCTION clinical.validate_note_transition();

CREATE OR REPLACE FUNCTION clinical.deny_note_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Nota clínica assinada não pode ser removida' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER encounter_notes_no_delete
  BEFORE DELETE ON clinical.encounter_notes
  FOR EACH ROW EXECUTE FUNCTION clinical.deny_note_delete();

CREATE TABLE clinical.observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  encounter_id uuid,
  hospitalization_id uuid, -- FK adiada
  surgery_id uuid,         -- FK adiada
  code text NOT NULL REFERENCES clinical.observation_codes(code),
  value_numeric numeric(12,4),
  value_text text,
  value_code text,
  uom text,
  entered_value text,
  entered_uom text,
  method text,
  scale text,
  measured_at timestamptz NOT NULL DEFAULT now(),
  measured_by_professional_id uuid,
  measured_by_user_id uuid,
  abnormal_flag text CHECK (abnormal_flag IN ('low', 'normal', 'high', 'critical')),
  abnormal_flag_status text CHECK (abnormal_flag_status IN ('informational', 'validated')),
  reference_range_id uuid REFERENCES registry.reference_ranges(id),
  reference_min numeric(12,4),
  reference_max numeric(12,4),
  status text NOT NULL DEFAULT 'final' CHECK (status IN ('final', 'entered_in_error')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL OR value_code IS NOT NULL),
  CONSTRAINT observations_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT observations_encounter_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX observations_patient_code_idx
  ON clinical.observations (tenant_id, patient_id, code, measured_at DESC);
CREATE INDEX observations_encounter_idx ON clinical.observations (tenant_id, encounter_id);

CREATE TABLE clinical.encounter_diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  condition_id uuid REFERENCES clinical.conditions(id),
  description text NOT NULL,
  kind text NOT NULL DEFAULT 'presumptive'
    CHECK (kind IN ('differential', 'presumptive', 'final', 'ruled_out')),
  rank integer NOT NULL DEFAULT 1,
  onset_at timestamptz,
  notes text,
  recorded_by uuid,
  recorded_by_professional_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT encounter_diagnoses_encounter_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT encounter_diagnoses_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX encounter_diagnoses_encounter_idx ON clinical.encounter_diagnoses (tenant_id, encounter_id);
CREATE INDEX encounter_diagnoses_patient_idx ON clinical.encounter_diagnoses (tenant_id, patient_id, recorded_at DESC);

CREATE TABLE clinical.encounter_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  service_id uuid,
  description text NOT NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  performed_by uuid,
  performed_by_professional_id uuid,
  materials jsonb,
  charge_item_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT encounter_procedures_encounter_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT encounter_procedures_service_fk
    FOREIGN KEY (tenant_id, service_id) REFERENCES registry.service_catalog (tenant_id, id)
);

CREATE TABLE clinical.patient_deaths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  encounter_id uuid,
  occurred_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('natural', 'euthanasia')),
  cause_condition_id uuid REFERENCES clinical.conditions(id),
  cause_text text,
  consent_id uuid,
  body_disposition text NOT NULL DEFAULT 'undefined'
    CHECK (body_disposition IN ('guardian', 'cremation', 'burial', 'other', 'undefined')),
  certificate_document_id uuid,
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, patient_id),
  CONSTRAINT patient_deaths_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT patient_deaths_encounter_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id)
);

CREATE TABLE clinical.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  number bigint NOT NULL,
  patient_id uuid NOT NULL,
  encounter_id uuid,
  professional_id uuid,
  kind text NOT NULL DEFAULT 'simple' CHECK (kind IN ('simple', 'controlled', 'special', 'compounded')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'cancelled', 'entered_in_error')),
  status_reason text,
  issued_at timestamptz,
  valid_until date,
  signed_at timestamptz,
  signed_by uuid,
  document_id uuid,
  supersedes_prescription_id uuid,
  notes text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT prescriptions_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id),
  CONSTRAINT prescriptions_encounter_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX prescriptions_patient_idx ON clinical.prescriptions (tenant_id, patient_id, created_at DESC);

CREATE OR REPLACE FUNCTION clinical.validate_prescription_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'draft' THEN RETURN NEW; END IF;
  IF OLD.status = 'signed' AND NEW.status IN ('cancelled', 'entered_in_error') THEN
    IF NEW.signed_at IS DISTINCT FROM OLD.signed_at OR NEW.document_id IS DISTINCT FROM OLD.document_id THEN
      RAISE EXCEPTION 'Receita assinada não pode ter assinatura ou documento alterados'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status AND OLD.status = 'signed' AND NEW.document_id IS NOT NULL AND OLD.document_id IS NULL THEN
    RETURN NEW; -- anexo do PDF logo após assinar
  END IF;
  RAISE EXCEPTION 'Transição de receita inválida: % para %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER prescriptions_transition
  BEFORE UPDATE ON clinical.prescriptions
  FOR EACH ROW EXECUTE FUNCTION clinical.validate_prescription_transition();

CREATE TABLE clinical.prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  prescription_id uuid NOT NULL,
  seq integer NOT NULL DEFAULT 1,
  product_id uuid, -- FK adiada (inventory.products)
  drug_name text NOT NULL,
  active_ingredient text,
  active_ingredient_normalized text,
  concentration_value numeric(12,4),
  concentration_uom text,
  form text,
  dose_value numeric(12,4),
  dose_uom text,
  dose_per_kg boolean NOT NULL DEFAULT false,
  computed_dose_value numeric(12,4),
  route text,
  frequency_kind text,
  frequency_value numeric(8,2),
  duration_days integer,
  until_date date,
  quantity numeric(12,3),
  quantity_uom text,
  instructions text,
  is_controlled boolean NOT NULL DEFAULT false,
  is_free_text boolean NOT NULL DEFAULT false,
  withdrawal_meat_days integer,
  withdrawal_milk_days integer,
  extra_label boolean NOT NULL DEFAULT false,
  extra_label_justification text,
  CONSTRAINT prescription_items_fk
    FOREIGN KEY (tenant_id, prescription_id) REFERENCES clinical.prescriptions (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX prescription_items_idx ON clinical.prescription_items (tenant_id, prescription_id, seq);

CREATE TABLE clinical.prescription_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  species_id uuid REFERENCES registry.species(id),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =================================================================== lab
CREATE TABLE lab.laboratories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  contact jsonb,
  integration jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id)
);

CREATE TABLE lab.exam_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('hematology', 'biochemistry', 'imaging', 'cytology',
    'microbiology', 'urinalysis', 'parasitology', 'other')),
  specimen_kind text,
  turnaround_hours integer,
  service_id uuid,
  analytes jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  UNIQUE NULLS NOT DISTINCT (tenant_id, code)
);

CREATE TABLE lab.exam_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  number bigint NOT NULL,
  patient_id uuid NOT NULL,
  encounter_id uuid,
  ordered_by_professional_id uuid,
  ordered_by_user_id uuid,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
  clinical_info text,
  status text NOT NULL DEFAULT 'ordered'
    CHECK (status IN ('ordered', 'partially_resulted', 'resulted', 'reviewed', 'cancelled')),
  cancel_reason text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT exam_orders_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id),
  CONSTRAINT exam_orders_encounter_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT exam_orders_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES platform.facilities (tenant_id, id)
);
CREATE INDEX exam_orders_patient_idx ON lab.exam_orders (tenant_id, patient_id, ordered_at DESC);
CREATE INDEX exam_orders_status_idx ON lab.exam_orders (tenant_id, status, ordered_at DESC);

CREATE TABLE lab.exam_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  exam_order_id uuid NOT NULL,
  exam_catalog_id uuid NOT NULL REFERENCES lab.exam_catalog(id),
  laboratory_id uuid,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'collected', 'sent', 'in_progress', 'resulted', 'reviewed', 'cancelled')),
  collected_at timestamptz,
  collected_by uuid,
  sent_at timestamptz,
  external_ref text,
  price_snapshot numeric(14,2),
  charge_item_id uuid,
  UNIQUE (tenant_id, id),
  CONSTRAINT exam_order_items_order_fk
    FOREIGN KEY (tenant_id, exam_order_id) REFERENCES lab.exam_orders (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX exam_order_items_order_idx ON lab.exam_order_items (tenant_id, exam_order_id);

CREATE TABLE lab.exam_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  exam_order_item_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  released_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid,
  report_text text,
  interpretation text,
  report_document_id uuid,
  status text NOT NULL DEFAULT 'final'
    CHECK (status IN ('preliminary', 'final', 'amended', 'entered_in_error')),
  status_reason text,
  supersedes_result_id uuid,
  superseded_by_result_id uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'integration')),
  UNIQUE (tenant_id, id),
  CONSTRAINT exam_results_item_fk
    FOREIGN KEY (tenant_id, exam_order_item_id) REFERENCES lab.exam_order_items (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE lab.exam_result_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  exam_result_id uuid NOT NULL,
  analyte_code text NOT NULL,
  analyte_name text NOT NULL,
  value_numeric numeric(14,4),
  value_text text,
  uom text,
  ref_min numeric(14,4),
  ref_max numeric(14,4),
  ref_source text,
  abnormal_flag text CHECK (abnormal_flag IN ('low', 'normal', 'high', 'critical')),
  sort integer NOT NULL DEFAULT 0,
  CONSTRAINT exam_result_values_fk
    FOREIGN KEY (tenant_id, exam_result_id) REFERENCES lab.exam_results (tenant_id, id) ON DELETE CASCADE
);

-- ========================================================== immunization
CREATE TABLE immunization.protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  species_id uuid REFERENCES registry.species(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'vaccine' CHECK (kind IN ('vaccine', 'deworming', 'ectoparasite')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  booster_interval_days integer,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE immunization.immunizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  encounter_id uuid,
  protocol_id uuid REFERENCES immunization.protocols(id),
  product_id uuid,     -- FK adiada
  stock_lot_id uuid,   -- FK adiada
  vaccine_name text NOT NULL,
  manufacturer text,
  lot_number text,
  expires_at date,
  administered_at timestamptz NOT NULL DEFAULT now(),
  professional_id uuid,
  administered_by_user_id uuid,
  route text,
  site text,
  dose_number integer,
  next_due_at date,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'not_done', 'entered_in_error')),
  reaction_notes text,
  stock_movement_id uuid,
  document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT immunizations_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT immunizations_encounter_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE SET NULL
);
CREATE INDEX immunizations_patient_idx ON immunization.immunizations (tenant_id, patient_id, administered_at DESC);
CREATE INDEX immunizations_due_idx ON immunization.immunizations (tenant_id, next_due_at)
  WHERE next_due_at IS NOT NULL AND status = 'completed';

CREATE TABLE immunization.preventive_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  encounter_id uuid,
  kind text NOT NULL CHECK (kind IN ('deworming', 'ectoparasite', 'other')),
  protocol_id uuid REFERENCES immunization.protocols(id),
  product_id uuid,
  product_name text NOT NULL,
  lot_number text,
  administered_at timestamptz NOT NULL DEFAULT now(),
  professional_id uuid,
  administered_by_user_id uuid,
  dose_text text,
  next_due_at date,
  notes text,
  stock_movement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preventive_patient_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES registry.patients (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT preventive_encounter_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE SET NULL
);
CREATE INDEX preventive_patient_idx ON immunization.preventive_treatments (tenant_id, patient_id, administered_at DESC);
CREATE INDEX preventive_due_idx ON immunization.preventive_treatments (tenant_id, next_due_at)
  WHERE next_due_at IS NOT NULL;

-- ============================================================= documents
CREATE TABLE documents.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES platform.tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  engine text NOT NULL DEFAULT 'pdfkit' CHECK (engine IN ('pdfkit', 'html')),
  body text,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  UNIQUE NULLS NOT DISTINCT (tenant_id, key)
);

CREATE TABLE documents.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  facility_id uuid,
  kind text NOT NULL,
  title text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  sha256 text,
  generated_from_table text,
  generated_from_id uuid,
  template_key text,
  version integer NOT NULL DEFAULT 1,
  version_of_id uuid,
  signed_at timestamptz,
  signed_by uuid,
  signature_meta jsonb,
  uploaded_by uuid,
  virus_scan_status text NOT NULL DEFAULT 'pending'
    CHECK (virus_scan_status IN ('pending', 'clean', 'infected', 'error', 'skipped')),
  exif_stripped boolean NOT NULL DEFAULT false,
  contains_personal_data boolean NOT NULL DEFAULT true,
  retention_until date,
  status text NOT NULL DEFAULT 'pending_upload'
    CHECK (status IN ('pending_upload', 'active', 'superseded', 'entered_in_error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, storage_key)
);
CREATE INDEX documents_tenant_idx ON documents.documents (tenant_id, created_at DESC);

CREATE TABLE documents.document_links (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('patient', 'guardian', 'encounter', 'exam_order',
    'prescription', 'patient_death', 'invoice')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, document_id, target_type, target_id),
  CONSTRAINT document_links_document_fk
    FOREIGN KEY (tenant_id, document_id) REFERENCES documents.documents (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX document_links_target_idx ON documents.document_links (tenant_id, target_type, target_id);

CREATE TABLE documents.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL,
  patient_id uuid,
  kind text NOT NULL CHECK (kind IN ('treatment', 'surgery', 'anesthesia', 'euthanasia',
    'hospitalization', 'data_processing', 'communication', 'image_use')),
  text_version text NOT NULL DEFAULT 'v1',
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  method text NOT NULL DEFAULT 'digital_click'
    CHECK (method IN ('signed_paper', 'digital_click', 'digital_signature')),
  evidence_document_id uuid,
  ip text,
  created_by uuid,
  CONSTRAINT consents_guardian_fk
    FOREIGN KEY (tenant_id, guardian_id) REFERENCES registry.guardians (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE documents.communication_preferences (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms', 'phone')),
  allowed boolean NOT NULL DEFAULT true,
  legal_basis text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, guardian_id, channel),
  CONSTRAINT comm_prefs_guardian_fk
    FOREIGN KEY (tenant_id, guardian_id) REFERENCES registry.guardians (tenant_id, id) ON DELETE CASCADE
);

-- =============================================================== billing
CREATE TABLE billing.charge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  patient_id uuid,
  payer_guardian_id uuid,
  encounter_id uuid,
  source_table text,
  source_id uuid,
  service_id uuid,
  product_id uuid,
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(14,2),
  discount numeric(14,2) NOT NULL DEFAULT 0,
  discount_reason text,
  total numeric(14,2),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'invoiced', 'settled_externally', 'cancelled')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  invoice_line_id uuid, -- FK adiada (fase 3)
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charge_items_encounter_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT charge_items_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES platform.facilities (tenant_id, id)
);
CREATE INDEX charge_items_encounter_idx ON billing.charge_items (tenant_id, encounter_id);
CREATE INDEX charge_items_pending_idx ON billing.charge_items (tenant_id, status, occurred_at DESC);

-- ============================================================= inventory
-- Estoque mínimo: produtos (usados por receita e vacina) e ledger vazio.
CREATE TABLE inventory.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  sku text,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'medication'
    CHECK (kind IN ('medication', 'vaccine', 'preventive', 'material', 'food', 'supply', 'equipment', 'retail')),
  active_ingredient text,
  active_ingredient_normalized text,
  concentration_value numeric(12,4),
  concentration_uom text,
  form text,
  manufacturer text,
  is_controlled boolean NOT NULL DEFAULT false,
  requires_lot boolean NOT NULL DEFAULT false,
  requires_expiry boolean NOT NULL DEFAULT false,
  base_uom text NOT NULL DEFAULT 'unit',
  sale_uom text,
  min_stock numeric(14,4),
  cost_price numeric(14,2),
  sale_price numeric(14,2),
  species_restrictions uuid[],
  default_withdrawal_meat_days integer,
  default_withdrawal_milk_days integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX products_sku_uq ON inventory.products (tenant_id, sku)
  WHERE sku IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX products_name_trgm ON inventory.products USING gin (name gin_trgm_ops);

CREATE TABLE inventory.product_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  scheme text NOT NULL CHECK (scheme IN ('gtin', 'ean13', 'dun14', 'internal', 'supplier', 'anvisa', 'datamatrix_gs1')),
  value text NOT NULL,
  pack_qty numeric(12,3) NOT NULL DEFAULT 1,
  pack_uom text,
  is_primary boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, scheme, value),
  CONSTRAINT product_identifiers_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES inventory.products (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE inventory.stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'pharmacy',
  active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, id),
  CONSTRAINT stock_locations_facility_fk
    FOREIGN KEY (tenant_id, facility_id) REFERENCES platform.facilities (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE inventory.stock_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  lot_number text NOT NULL,
  expires_at date,
  supplier_id uuid,
  unit_cost numeric(14,4),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_id, lot_number),
  CONSTRAINT stock_lots_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES inventory.products (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE inventory.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  location_id uuid,
  product_id uuid NOT NULL,
  stock_lot_id uuid,
  kind text NOT NULL CHECK (kind IN ('receipt', 'issue', 'dispense', 'consume', 'adjust_in',
    'adjust_out', 'transfer_in', 'transfer_out', 'loss', 'return')),
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,4),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  performed_by uuid,
  ref_table text,
  ref_id uuid,
  scan_source text CHECK (scan_source IN ('hid', 'camera', 'manual')),
  idempotency_key text,
  notes text,
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT stock_movements_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES inventory.products (tenant_id, id)
);
CREATE INDEX stock_movements_product_idx ON inventory.stock_movements (tenant_id, product_id, occurred_at DESC);
CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON inventory.stock_movements
  FOR EACH ROW EXECUTE FUNCTION platform.deny_write();

-- ================================================== FKs adiadas resolvidas
ALTER TABLE registry.patients
  ADD CONSTRAINT patients_photo_document_fk
  FOREIGN KEY (tenant_id, photo_document_id) REFERENCES documents.documents (tenant_id, id) ON DELETE SET NULL;

ALTER TABLE registry.patient_allergies
  ADD CONSTRAINT patient_allergies_product_fk
  FOREIGN KEY (tenant_id, product_id) REFERENCES inventory.products (tenant_id, id) ON DELETE SET NULL;

ALTER TABLE clinical.prescription_items
  ADD CONSTRAINT prescription_items_product_fk
  FOREIGN KEY (tenant_id, product_id) REFERENCES inventory.products (tenant_id, id) ON DELETE SET NULL;

ALTER TABLE clinical.prescriptions
  ADD CONSTRAINT prescriptions_document_fk
  FOREIGN KEY (tenant_id, document_id) REFERENCES documents.documents (tenant_id, id) ON DELETE SET NULL;

ALTER TABLE immunization.immunizations
  ADD CONSTRAINT immunizations_product_fk
  FOREIGN KEY (tenant_id, product_id) REFERENCES inventory.products (tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT immunizations_lot_fk
  FOREIGN KEY (tenant_id, stock_lot_id) REFERENCES inventory.stock_lots (tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT immunizations_document_fk
  FOREIGN KEY (tenant_id, document_id) REFERENCES documents.documents (tenant_id, id) ON DELETE SET NULL;

ALTER TABLE clinical.patient_deaths
  ADD CONSTRAINT patient_deaths_certificate_fk
  FOREIGN KEY (tenant_id, certificate_document_id) REFERENCES documents.documents (tenant_id, id) ON DELETE SET NULL;

ALTER TABLE lab.exam_results
  ADD CONSTRAINT exam_results_document_fk
  FOREIGN KEY (tenant_id, report_document_id) REFERENCES documents.documents (tenant_id, id) ON DELETE SET NULL;

ALTER TABLE scheduling.appointments
  ADD CONSTRAINT appointments_encounter_fk
  FOREIGN KEY (tenant_id, encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE SET NULL;

ALTER TABLE clinical.encounters
  ADD CONSTRAINT encounters_followup_appointment_fk
  FOREIGN KEY (tenant_id, follow_up_appointment_id) REFERENCES scheduling.appointments (tenant_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT encounters_followup_of_fk
  FOREIGN KEY (tenant_id, follow_up_of_encounter_id) REFERENCES clinical.encounters (tenant_id, id) ON DELETE SET NULL;

-- ---------------------------------------------------------- updated_at
CREATE TRIGGER guardians_updated_at BEFORE UPDATE ON registry.guardians
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER patients_updated_at BEFORE UPDATE ON registry.patients
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER services_updated_at BEFORE UPDATE ON registry.service_catalog
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON scheduling.appointments
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER encounters_updated_at BEFORE UPDATE ON clinical.encounters
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON clinical.encounter_notes
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER prescriptions_updated_at BEFORE UPDATE ON clinical.prescriptions
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER exam_orders_updated_at BEFORE UPDATE ON lab.exam_orders
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents.documents
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON inventory.products
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ------------------------------------------------------------- privilégios
GRANT USAGE ON SCHEMA scheduling, clinical, lab, immunization, documents, billing, inventory
  TO chiron_app, chiron_iam, chiron_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA
  registry, scheduling, clinical, lab, immunization, documents, billing, inventory
  TO chiron_app, chiron_admin;
GRANT SELECT ON ALL TABLES IN SCHEMA registry TO chiron_iam;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA
  registry, scheduling, clinical, lab, immunization, documents, billing, inventory
  TO chiron_app, chiron_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA scheduling, clinical, lab, immunization, documents, billing, inventory
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chiron_app, chiron_admin;
REVOKE UPDATE, DELETE ON inventory.stock_movements FROM chiron_app;

-- ------------------------------------------------------------------- RLS
DO $$
DECLARE
  r record;
  v_family text;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name, n.nspname AS schema_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('registry', 'scheduling', 'clinical', 'lab', 'immunization', 'documents', 'billing', 'inventory')
      AND c.relkind = 'r'
      -- tabelas que já receberam política numa migração anterior
      AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname)
  LOOP
    -- catálogos híbridos: tenant_id anulável
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = r.schema_name AND col.table_name = r.table_name
          AND col.column_name = 'tenant_id' AND col.is_nullable = 'YES'
      ) THEN 'catalog'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = r.schema_name AND col.table_name = r.table_name
          AND col.column_name = 'tenant_id'
      ) THEN 'tenant'
      ELSE 'global'
    END INTO v_family;

    IF v_family = 'tenant' THEN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schema_name, r.table_name);
      EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', r.schema_name, r.table_name);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I.%I USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id())',
        r.schema_name, r.table_name);
      EXECUTE format(
        'ALTER TABLE %I.%I ALTER COLUMN tenant_id SET DEFAULT platform.current_tenant_id()',
        r.schema_name, r.table_name);
    ELSIF v_family = 'catalog' THEN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schema_name, r.table_name);
      EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', r.schema_name, r.table_name);
      EXECUTE format(
        'CREATE POLICY catalog_read ON %I.%I FOR SELECT USING (tenant_id IS NULL OR tenant_id = platform.current_tenant_id())',
        r.schema_name, r.table_name);
      EXECUTE format(
        'CREATE POLICY catalog_write ON %I.%I FOR ALL USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id())',
        r.schema_name, r.table_name);
    END IF;

    INSERT INTO platform.rls_policy_registry (table_schema, table_name, family)
    VALUES (r.schema_name, r.table_name, v_family)
    ON CONFLICT (table_schema, table_name) DO UPDATE SET family = EXCLUDED.family;
  END LOOP;
END
$$;

-- observation_codes é catálogo global sem tenant_id
UPDATE platform.rls_policy_registry SET family = 'global'
  WHERE table_schema = 'clinical' AND table_name = 'observation_codes';
