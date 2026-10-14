CREATE TABLE public.visit_note_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, visit_id text NOT NULL, client_id text NOT NULL, source_kind text NOT NULL CHECK (source_kind IN ('voice','text')), transcript text NOT NULL, ai_draft jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.visit_note_drafts TO authenticated;
GRANT ALL ON public.visit_note_drafts TO service_role;
ALTER TABLE public.visit_note_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own note drafts" ON public.visit_note_drafts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TABLE public.visit_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, draft_id uuid NOT NULL UNIQUE REFERENCES public.visit_note_drafts(id), visit_id text NOT NULL, client_id text NOT NULL, transcript text NOT NULL, ai_draft jsonb NOT NULL, final_text jsonb NOT NULL, source_kind text NOT NULL, confirmed_by_staff_id text NOT NULL, confirmed_at timestamptz NOT NULL DEFAULT now(), provenance jsonb NOT NULL
);
GRANT SELECT ON public.visit_notes TO authenticated;
GRANT ALL ON public.visit_notes TO service_role;
ALTER TABLE public.visit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own confirmed notes" ON public.visit_notes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TABLE public.ai_access_blocks (endpoint text PRIMARY KEY, status integer NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.ai_access_blocks TO service_role;
ALTER TABLE public.ai_access_blocks ENABLE ROW LEVEL SECURITY;