CREATE TABLE public.medication_staff_access (
 user_id uuid PRIMARY KEY,
 organisation_id text NOT NULL,
 staff_id text NOT NULL UNIQUE,
 access_role text NOT NULL CHECK (access_role IN ('admin','manager','coordinator','frontline','viewonly')),
 site_ids text[] NOT NULL,
 can_configure boolean NOT NULL DEFAULT false,
 can_administer boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.medication_staff_access TO authenticated;
GRANT ALL ON public.medication_staff_access TO service_role;
ALTER TABLE public.medication_staff_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own medication access" ON public.medication_staff_access FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.medication_has_access(_organisation_id text, _site_id text, _roles text[] DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.medication_staff_access a WHERE a.user_id = auth.uid() AND a.organisation_id = _organisation_id AND _site_id = ANY(a.site_ids) AND (_roles IS NULL OR a.access_role = ANY(_roles)))
$$;

CREATE TABLE public.medication_visits (
 visit_id text PRIMARY KEY,
 organisation_id text NOT NULL,
 client_id text NOT NULL,
 site_id text NOT NULL,
 assigned_staff_ids text[] NOT NULL,
 scheduled_start timestamptz NOT NULL,
 scheduled_end timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.medication_visits TO authenticated;
GRANT ALL ON public.medication_visits TO service_role;
ALTER TABLE public.medication_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read medication visits" ON public.medication_visits FOR SELECT TO authenticated USING (public.medication_has_access(organisation_id, site_id, ARRAY['admin','manager','coordinator','viewonly']));

CREATE TABLE public.medications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organisation_id text NOT NULL,
 client_id text NOT NULL,
 site_id text NOT NULL,
 name text NOT NULL,
 strength text NOT NULL,
 status text NOT NULL CHECK (status IN ('draft','active','suspended','discontinued')),
 current_version_id uuid,
 created_by_staff_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.medications TO authenticated;
GRANT ALL ON public.medications TO service_role;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read medications" ON public.medications FOR SELECT TO authenticated USING (public.medication_has_access(organisation_id, site_id, ARRAY['admin','manager','coordinator','viewonly']));

CREATE TABLE public.medication_instruction_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 medication_id uuid NOT NULL REFERENCES public.medications(id),
 version_number integer NOT NULL,
 dose text NOT NULL,
 route text NOT NULL,
 frequency text NOT NULL,
 scheduled_times text[] NOT NULL,
 regularity text NOT NULL CHECK (regularity IN ('regular','prn')),
 support_level text NOT NULL CHECK (support_level IN ('prompt','assist','administer')),
 start_date date NOT NULL,
 end_date date,
 source_document text NOT NULL,
 provider_instructions text NOT NULL,
 verification_status text NOT NULL CHECK (verification_status IN ('draft','verified','active','suspended','discontinued')),
 verified_by_staff_id text,
 verified_at timestamptz,
 effective_from timestamptz,
 created_by_staff_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 supersedes_id uuid REFERENCES public.medication_instruction_versions(id),
 UNIQUE (medication_id, version_number)
);
GRANT SELECT ON public.medication_instruction_versions TO authenticated;
GRANT ALL ON public.medication_instruction_versions TO service_role;
ALTER TABLE public.medication_instruction_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read instruction versions" ON public.medication_instruction_versions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.medications m WHERE m.id = medication_id AND public.medication_has_access(m.organisation_id, m.site_id, ARRAY['admin','manager','coordinator','viewonly'])));

CREATE TABLE public.medication_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organisation_id text NOT NULL,
 client_id text NOT NULL,
 site_id text NOT NULL,
 medication_id uuid NOT NULL REFERENCES public.medications(id),
 instruction_version_id uuid NOT NULL REFERENCES public.medication_instruction_versions(id),
 visit_id text REFERENCES public.medication_visits(visit_id),
 scheduled_at timestamptz NOT NULL,
 documentation_due_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (instruction_version_id, visit_id, scheduled_at)
);
GRANT SELECT ON public.medication_tasks TO authenticated;
GRANT ALL ON public.medication_tasks TO service_role;
ALTER TABLE public.medication_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read medication tasks" ON public.medication_tasks FOR SELECT TO authenticated USING (public.medication_has_access(organisation_id, site_id, ARRAY['admin','manager','coordinator','viewonly']));

CREATE TABLE public.medication_outcomes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organisation_id text NOT NULL,
 client_id text NOT NULL,
 site_id text NOT NULL,
 task_id uuid NOT NULL REFERENCES public.medication_tasks(id),
 medication_id uuid NOT NULL REFERENCES public.medications(id),
 instruction_version_id uuid NOT NULL REFERENCES public.medication_instruction_versions(id),
 visit_id text REFERENCES public.medication_visits(visit_id),
 staff_id text NOT NULL,
 submitted_by_user_id uuid NOT NULL,
 outcome text NOT NULL CHECK (outcome IN ('administered','assistance_provided','prompted','person_reports_taken','intake_observed','refused','not_completed','not_observed')),
 event_at timestamptz NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL DEFAULT '',
 idempotency_key uuid NOT NULL,
 correction_of uuid REFERENCES public.medication_outcomes(id),
 correction_reason text,
 UNIQUE (submitted_by_user_id, idempotency_key)
);
CREATE UNIQUE INDEX one_original_medication_outcome ON public.medication_outcomes(task_id) WHERE correction_of IS NULL;
GRANT SELECT ON public.medication_outcomes TO authenticated;
GRANT ALL ON public.medication_outcomes TO service_role;
ALTER TABLE public.medication_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read medication outcomes" ON public.medication_outcomes FOR SELECT TO authenticated USING (public.medication_has_access(organisation_id, site_id, ARRAY['admin','manager','coordinator','viewonly']));

CREATE TABLE public.medication_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organisation_id text NOT NULL,
 client_id text NOT NULL,
 site_id text NOT NULL,
 task_id uuid NOT NULL REFERENCES public.medication_tasks(id),
 outcome_id uuid REFERENCES public.medication_outcomes(id),
 exception_key text NOT NULL UNIQUE,
 kind text NOT NULL CHECK (kind IN ('refusal','not_completed','documentation_missing','outcome_unknown','discrepancy')),
 status text NOT NULL CHECK (status IN ('open','acknowledged','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),
 acknowledged_by_staff_id text,
 acknowledged_at timestamptz,
 follow_up text,
 follow_up_by_staff_id text,
 follow_up_at timestamptz,
 resolved_by_staff_id text,
 resolved_at timestamptz,
 resolution text
);
GRANT SELECT ON public.medication_exceptions TO authenticated;
GRANT ALL ON public.medication_exceptions TO service_role;
ALTER TABLE public.medication_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read medication exceptions" ON public.medication_exceptions FOR SELECT TO authenticated USING (public.medication_has_access(organisation_id, site_id, ARRAY['admin','manager','coordinator','viewonly']));

CREATE TABLE public.medication_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 exception_id uuid NOT NULL REFERENCES public.medication_exceptions(id),
 status text NOT NULL CHECK (status IN ('manual_required','pending','delivered','failed')),
 detail text NOT NULL,
 attempted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.medication_notifications TO authenticated;
GRANT ALL ON public.medication_notifications TO service_role;
ALTER TABLE public.medication_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read medication notifications" ON public.medication_notifications FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.medication_exceptions e WHERE e.id = exception_id AND public.medication_has_access(e.organisation_id, e.site_id, ARRAY['admin','manager','coordinator','viewonly'])));

CREATE TABLE public.medication_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organisation_id text NOT NULL,
 client_id text,
 site_id text NOT NULL,
 actor_user_id uuid NOT NULL,
 actor_staff_id text NOT NULL,
 action text NOT NULL,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.medication_audit TO authenticated;
GRANT ALL ON public.medication_audit TO service_role;
ALTER TABLE public.medication_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read medication audit" ON public.medication_audit FOR SELECT TO authenticated USING (public.medication_has_access(organisation_id, site_id, ARRAY['admin','manager','coordinator','viewonly']));

INSERT INTO public.medication_visits (visit_id, organisation_id, client_id, site_id, assigned_staff_ids, scheduled_start, scheduled_end) VALUES
 ('VIS-DEMO-MARY-0930','ORG-LOGUP-HOMECARE','PS-002','SITE-ECK',ARRAY['STAFF-AISLING'],'2026-11-06 09:30+00','2026-11-06 10:15+00'),
 ('VIS-DEMO-MARY-NOMED','ORG-LOGUP-HOMECARE','PS-002','SITE-ECK',ARRAY['STAFF-AISLING'],'2026-11-06 12:00+00','2026-11-06 12:30+00');
INSERT INTO public.medications (id, organisation_id, client_id, site_id, name, strength, status, current_version_id, created_by_staff_id) VALUES
 ('10000000-0000-4000-8000-000000000001','ORG-LOGUP-HOMECARE','PS-002','SITE-ECK','Paracetamol (fictional demo)','500 mg tablets','active','20000000-0000-4000-8000-000000000001','STAFF-DANIEL');
INSERT INTO public.medication_instruction_versions (id, medication_id, version_number, dose, route, frequency, scheduled_times, regularity, support_level, start_date, source_document, provider_instructions, verification_status, verified_by_staff_id, verified_at, effective_from, created_by_staff_id) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'1 g (two 500 mg tablets)','Oral','Once daily at the scheduled morning visit',ARRAY['09:30'],'regular','prompt','2026-11-06','Fictional approved medication list for controlled testing only','Prompt only. Do not administer. Record the person’s response and follow the provider escalation policy.','active','STAFF-DANIEL','2026-11-06 08:00+00','2026-11-06 09:00+00','STAFF-DANIEL');
INSERT INTO public.medication_tasks (id, organisation_id, client_id, site_id, medication_id, instruction_version_id, visit_id, scheduled_at, documentation_due_at) VALUES
 ('30000000-0000-4000-8000-000000000001','ORG-LOGUP-HOMECARE','PS-002','SITE-ECK','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','VIS-DEMO-MARY-0930','2026-11-06 09:30+00','2026-11-06 10:45+00');
