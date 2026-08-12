-- P1 auditoría Momence-vs-Tentare: atribución de origen (lead-id). Texto
-- libre sin FK/CHECK, mismo criterio que studios.como_nos_conocio (migr
-- 0123): copia lo que traiga la URL (?ref=), sin interpretar/categorizar.
ALTER TABLE public.socios ADD COLUMN IF NOT EXISTS origen_lead text;
