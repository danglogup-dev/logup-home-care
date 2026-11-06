CREATE OR REPLACE FUNCTION public.submit_medication_outcome(
 p_user_id uuid, p_task_id uuid, p_visit_id text, p_outcome text, p_event_at timestamptz,
 p_reason text, p_idempotency_key uuid, p_correction_of uuid DEFAULT NULL, p_correction_reason text DEFAULT NULL
) RETURNS public.medication_outcomes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 a public.medication_staff_access; t public.medication_tasks; v public.medication_visits;
 m public.medications; i public.medication_instruction_versions; o public.medication_outcomes;
 original public.medication_outcomes; exception_kind text; exception_id uuid;
BEGIN
 SELECT * INTO t FROM public.medication_tasks WHERE id = p_task_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Medication task not found.' USING ERRCODE = 'P0002'; END IF;
 SELECT * INTO a FROM public.medication_staff_access WHERE user_id = p_user_id AND organisation_id = t.organisation_id AND t.site_id = ANY(site_ids);
 IF NOT FOUND OR a.access_role = 'viewonly' THEN RAISE EXCEPTION 'You are not authorised to record medication in this service area.' USING ERRCODE = '42501'; END IF;
 SELECT * INTO v FROM public.medication_visits WHERE visit_id = p_visit_id;
 IF NOT FOUND OR v.organisation_id <> t.organisation_id OR v.client_id <> t.client_id OR v.site_id <> t.site_id OR t.visit_id IS DISTINCT FROM p_visit_id THEN RAISE EXCEPTION 'The visit does not match this medication task.' USING ERRCODE = '23514'; END IF;
 IF NOT a.staff_id = ANY(v.assigned_staff_ids) THEN RAISE EXCEPTION 'You are not assigned to this visit.' USING ERRCODE = '42501'; END IF;
 SELECT * INTO m FROM public.medications WHERE id = t.medication_id;
 SELECT * INTO i FROM public.medication_instruction_versions WHERE id = t.instruction_version_id;
 IF m.id IS NULL OR i.id IS NULL OR m.client_id <> t.client_id OR i.medication_id <> t.medication_id OR m.status <> 'active' THEN RAISE EXCEPTION 'The authorised medication instruction is not active.' USING ERRCODE = '23514'; END IF;
 IF p_outcome = 'administered' AND (i.support_level <> 'administer' OR NOT a.can_administer) THEN RAISE EXCEPTION 'You are not authorised to record administration for this task.' USING ERRCODE = '42501'; END IF;
 IF p_outcome = 'assistance_provided' AND i.support_level <> 'assist' THEN RAISE EXCEPTION 'This outcome is not permitted for the authorised support type.' USING ERRCODE = '23514'; END IF;
 IF p_outcome IN ('prompted','person_reports_taken') AND i.support_level <> 'prompt' THEN RAISE EXCEPTION 'This outcome is not permitted for the authorised support type.' USING ERRCODE = '23514'; END IF;
 IF p_outcome = 'intake_observed' AND i.support_level NOT IN ('assist','administer') THEN RAISE EXCEPTION 'This outcome is not permitted for the authorised support type.' USING ERRCODE = '23514'; END IF;
 IF p_outcome NOT IN ('administered','assistance_provided','prompted','person_reports_taken','intake_observed','refused','not_completed','not_observed') THEN RAISE EXCEPTION 'Unknown medication outcome.' USING ERRCODE = '23514'; END IF;
 IF p_event_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'The activity time cannot be in the future.' USING ERRCODE = '23514'; END IF;
 IF p_outcome IN ('refused','not_completed','not_observed') AND length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Record a reason or observation for this outcome.' USING ERRCODE = '23514'; END IF;
 SELECT * INTO o FROM public.medication_outcomes WHERE submitted_by_user_id = p_user_id AND idempotency_key = p_idempotency_key;
 IF FOUND THEN
  IF o.task_id <> p_task_id OR o.outcome <> p_outcome OR o.event_at <> p_event_at OR o.reason <> trim(p_reason) OR o.correction_of IS DISTINCT FROM p_correction_of THEN RAISE EXCEPTION 'This submission key was already used for different information.' USING ERRCODE = '23505'; END IF;
  RETURN o;
 END IF;
 IF p_correction_of IS NOT NULL THEN
  SELECT * INTO original FROM public.medication_outcomes WHERE id = p_correction_of;
  IF NOT FOUND OR original.task_id <> p_task_id OR original.submitted_by_user_id <> p_user_id THEN RAISE EXCEPTION 'The record to correct does not match this task and staff member.' USING ERRCODE = '23514'; END IF;
  IF length(trim(coalesce(p_correction_reason,''))) = 0 THEN RAISE EXCEPTION 'A correction reason is required.' USING ERRCODE = '23514'; END IF;
 ELSE
  IF EXISTS (SELECT 1 FROM public.medication_outcomes WHERE task_id = p_task_id AND correction_of IS NULL) THEN RAISE EXCEPTION 'An outcome is already recorded. Add a traceable correction instead.' USING ERRCODE = '23505'; END IF;
 END IF;
 INSERT INTO public.medication_outcomes (organisation_id,client_id,site_id,task_id,medication_id,instruction_version_id,visit_id,staff_id,submitted_by_user_id,outcome,event_at,reason,idempotency_key,correction_of,correction_reason)
 VALUES (t.organisation_id,t.client_id,t.site_id,t.id,t.medication_id,t.instruction_version_id,t.visit_id,a.staff_id,p_user_id,p_outcome,p_event_at,trim(p_reason),p_idempotency_key,p_correction_of,NULLIF(trim(coalesce(p_correction_reason,'')),'')) RETURNING * INTO o;
 IF p_correction_of IS NOT NULL THEN exception_kind := 'discrepancy';
 ELSIF p_outcome = 'refused' THEN exception_kind := 'refusal';
 ELSIF p_outcome = 'not_completed' THEN exception_kind := 'not_completed';
 ELSIF p_outcome = 'not_observed' THEN exception_kind := 'outcome_unknown';
 END IF;
 IF exception_kind IS NOT NULL THEN
  INSERT INTO public.medication_exceptions (organisation_id,client_id,site_id,task_id,outcome_id,exception_key,kind)
  VALUES (t.organisation_id,t.client_id,t.site_id,t.id,o.id,concat('task:',t.id,':',exception_kind,':',o.id),exception_kind)
  ON CONFLICT (exception_key) DO UPDATE SET outcome_id = EXCLUDED.outcome_id RETURNING id INTO exception_id;
  INSERT INTO public.medication_notifications (exception_id,status,detail) VALUES (exception_id,'manual_required','No authorised notification recipient is configured. Contact the manager or on-call person using the provider-approved fallback; this screen is not acknowledgement.');
 END IF;
 INSERT INTO public.medication_audit (organisation_id,client_id,site_id,actor_user_id,actor_staff_id,action,entity_type,entity_id,details)
 VALUES (t.organisation_id,t.client_id,t.site_id,p_user_id,a.staff_id,CASE WHEN p_correction_of IS NULL THEN 'outcome_submitted' ELSE 'outcome_corrected' END,'medication_outcome',o.id::text,jsonb_build_object('taskId',t.id,'visitId',t.visit_id,'instructionVersionId',t.instruction_version_id,'outcome',o.outcome,'eventAt',o.event_at,'correctionOf',o.correction_of));
 RETURN o;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_medication_outcome(uuid,uuid,text,text,timestamptz,text,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_medication_outcome(uuid,uuid,text,text,timestamptz,text,uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.sweep_medication_documentation(p_user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t RECORD; n integer := 0; exception_id uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.medication_staff_access WHERE user_id = p_user_id AND access_role IN ('admin','manager','coordinator')) THEN RAISE EXCEPTION 'Manager authorisation is required.' USING ERRCODE = '42501'; END IF;
 FOR t IN SELECT t.* FROM public.medication_tasks t JOIN public.medication_staff_access a ON a.user_id = p_user_id AND a.organisation_id = t.organisation_id AND t.site_id = ANY(a.site_ids) AND a.access_role IN ('admin','manager','coordinator') WHERE t.documentation_due_at < now() AND NOT EXISTS (SELECT 1 FROM public.medication_outcomes o WHERE o.task_id = t.id AND o.correction_of IS NULL) LOOP
  INSERT INTO public.medication_exceptions (organisation_id,client_id,site_id,task_id,exception_key,kind) VALUES (t.organisation_id,t.client_id,t.site_id,t.id,concat('task:',t.id,':documentation_missing'),'documentation_missing') ON CONFLICT (exception_key) DO NOTHING RETURNING id INTO exception_id;
  IF exception_id IS NOT NULL THEN
   n := n + 1;
   INSERT INTO public.medication_notifications (exception_id,status,detail) VALUES (exception_id,'manual_required','Documentation deadline passed. This does not prove medication was missed. Contact the assigned carer and manager using the approved fallback.');
  END IF;
 END LOOP;
 RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.sweep_medication_documentation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_medication_documentation(uuid) TO service_role;
