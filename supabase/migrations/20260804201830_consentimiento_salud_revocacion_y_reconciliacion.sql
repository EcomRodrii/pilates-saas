-- Fila 12 del informe estratégico (P1 España): "Datos de salud sin base
-- legal sólida" → "Consentimiento explícito trazable, revocación al causar
-- baja".
--
-- Al aplicar la migración de trazabilidad+enforcement diseñada para esta
-- fila, `apply_migration` rechazó la creación de las policies por
-- "already exists": OTRA sesión concurrente ya había aplicado directamente
-- a prod el enforcement de INSERT (tiene_consentimiento_salud() conectada a
-- la RLS de condiciones_salud) bajo nombres de policy distintos
-- (salud_condiciones_salud_insert/update/delete/lectura) SIN dejar ningún
-- fichero de migración en git para ello — divergencia real prod/git.
--
-- Esta migración: (1) añade lo que de verdad faltaba (la columna de
-- revocación + la función actualizada para comprobarla — tiene_consentimiento_salud
-- vivía sin este chequeo), y (2) recaptura las 4 policies ya vivas bajo sus
-- nombres REALES (no los que se había planeado usar) para que
-- `supabase db push` desde limpio no las vea "pendientes" y las duplique con
-- otro nombre — mismo principio que ya aplica este repo al renombrar
-- ficheros de migración a la versión realmente aplicada.

alter table public.socios
  add column if not exists consentimiento_salud_revocado_en timestamptz;

comment on column public.socios.consentimiento_salud_revocado_en is
  'Cuándo dejó de estar vigente el consentimiento de datos de salud — se marca al dar de baja completa a la socia (app/api/socios/eliminar), momento en el que condiciones_salud ya se ha borrado por completo. NULL = vigente o nunca dado.';

-- Misma firma que ya existía: CREATE OR REPLACE conserva los GRANT.
create or replace function public.tiene_consentimiento_salud(p_socio_id text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select consentimiento_salud_fecha is not null and consentimiento_salud_revocado_en is null
  from public.socios
  where id = p_socio_id;
$function$;

-- Recaptura de las 4 policies ya aplicadas en prod (mismos nombres,
-- confirmado con pg_policies antes de escribir esto), sin cambiar su
-- criterio — solo para que el fichero de migración exista en git.
drop policy if exists salud_condiciones_salud_lectura on public.condiciones_salud;
create policy salud_condiciones_salud_lectura on public.condiciones_salud
  for select to authenticated
  using (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'));

drop policy if exists salud_condiciones_salud_update on public.condiciones_salud;
create policy salud_condiciones_salud_update on public.condiciones_salud
  for update to authenticated
  using      (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'))
  with check (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'));

drop policy if exists salud_condiciones_salud_delete on public.condiciones_salud;
create policy salud_condiciones_salud_delete on public.condiciones_salud
  for delete to authenticated
  using (studio_id = current_studio_id() and current_rol() in ('PROPIETARIO', 'INSTRUCTOR'));

drop policy if exists salud_condiciones_salud_insert on public.condiciones_salud;
create policy salud_condiciones_salud_insert on public.condiciones_salud
  for insert to authenticated
  with check (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

grant execute on function public.tiene_consentimiento_salud(text) to authenticated;
