-- El aviso de «llevas 30 días sin usar Tentare» (lib/retencion/aviso-inactividad.ts) se manda UNA vez por
-- estudio. Esta tabla es la memoria de a quién ya se avisó, con el mismo compare-and-set que el resumen
-- semanal: la fila se reclama ANTES de enviar, así que dos pasadas a la vez no mandan dos correos.
--
-- NO borra ni cambia nada de ningún estudio: solo apunta que se avisó. Aditiva, sin datos que migrar.
create table if not exists public.avisos_inactividad (
  studio_id text primary key references public.studios(id) on delete cascade,
  avisado_en timestamptz not null default now(),
  -- Los días sin actividad que medía `situacion_estudios()` cuando se avisó (auditable sin leer logs).
  dias_sin_actividad integer not null check (dias_sin_actividad >= 0)
);

alter table public.avisos_inactividad enable row level security;
-- Solo el servidor (cron, service-role) la lee y la escribe; sin política para authenticated/anon.
revoke all on public.avisos_inactividad from public, anon, authenticated;
grant select, insert, delete on public.avisos_inactividad to service_role;

-- Toda tabla con RLS lleva la política restrictiva del segundo paso (ver 20261003102845):
-- supabase/tests/rls-doble-factor.test.ts falla sin ella.
create policy exige_doble_factor on public.avisos_inactividad as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
