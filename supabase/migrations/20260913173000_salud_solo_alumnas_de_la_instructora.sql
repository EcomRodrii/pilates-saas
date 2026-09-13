-- Datos de salud (art. 9 RGPD): una INSTRUCTORA solo ve y escribe la salud de
-- SUS alumnas; la PROPIETARIA sigue viendo todas.
--
-- Decisión de producto cerrada (auditoría RGPD 2026-09-13, H6/M4): «sus
-- alumnas» = socias con una reserva no cancelada en una clase que ella imparte,
-- o una cita con ella, entre hace 30 días y dentro de 30 días. Antes cualquier
-- instructora del estudio leía la ficha clínica de las 32 socias de studio-1
-- (verificado impersonando, `begin read only … rollback`).
--
-- Piezas:
--  1. `instructora_atiende_socia(text)` — SECURITY DEFINER porque se evalúa
--     dentro de la RLS de cinco tablas y consulta `reservas`/`sesiones`/`citas`.
--     `search_path = ''`: todo va calificado con `public.`.
--  2. Las 13 políticas de `condiciones_salud`, `respuestas_sesion`,
--     `respuestas_cuestionario_salud`, `valoraciones_iniciales_salud` y
--     `notas_progreso`: mismo gate de estudio y consentimiento que ya tenían, y
--     el rol pasa de `in ('PROPIETARIO','INSTRUCTOR')` a
--     `PROPIETARIO or (INSTRUCTOR and instructora_atiende_socia(socio_id))`.
--     Mismos nombres de política que en prod (leídos de `pg_policies` antes de
--     escribir esto).
--  3. `semaforo_salud_estudio`: la instructora solo recibe el color de sus
--     alumnas, y la guardia de rol falla CERRADA con rol NULL (antes
--     `NULL not in (...)` es NULL y no lanzaba).
--
-- Rendimiento: la función es un EXISTS por fila. EXPLAIN en prod (solo lectura)
-- con ids reales: `idx_reservas_studio_socio` → `sesiones_pkey`, y `citas` por
-- `idx_citas_socio` (en prod hace seq scan porque tiene 10 filas). No hace falta
-- índice nuevo.
--
-- Qué NO cambia: RECEPCIÓN/MANAGER siguen sin detalle clínico y con el color
-- del semáforo de todo el estudio; el camino service-role (`auth.uid()` NULL)
-- no pasa por aquí (las rutas de servidor aplican la misma regla en TS,
-- `lib/datos-salud/acceso-servidor.ts`).

-- ─── 1. La función ──────────────────────────────────────────────────────────

create or replace function public.instructora_atiende_socia(p_socio_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with yo as (
    select public.current_studio_id() as studio_id,
           public.current_instructor_id() as instructor_id
  )
  select coalesce((
    select yo.instructor_id is not null
       and p_socio_id is not null
       and (
         exists (
           select 1
           from public.reservas r
           join public.sesiones s on s.id = r.sesion_id
           where r.socio_id = p_socio_id
             and r.studio_id = yo.studio_id
             and s.studio_id = yo.studio_id
             and s.instructor_id = yo.instructor_id
             and coalesce(s.cancelada, false) = false
             and r.estado <> 'CANCELADA'
             and s.inicio >= now() - interval '30 days'
             and s.inicio <= now() + interval '30 days'
         )
         or exists (
           select 1
           from public.citas c
           where c.socio_id = p_socio_id
             and c.studio_id = yo.studio_id
             and c.instructor_id = yo.instructor_id
             and c.estado <> 'CANCELADA'
             and c.inicio >= now() - interval '30 days'
             and c.inicio <= now() + interval '30 days'
         )
       )
    from yo
  ), false);
$function$;

-- `pg_default_acl` de este proyecto da EXECUTE directo a anon/authenticated en
-- toda función nueva: revocar PUBLIC no basta. `authenticated` SÍ la necesita
-- (la evalúa la RLS con su rol); anon no.
revoke all on function public.instructora_atiende_socia(text) from public;
revoke all on function public.instructora_atiende_socia(text) from anon;
grant execute on function public.instructora_atiende_socia(text) to authenticated, service_role;

-- ─── 2. Políticas ───────────────────────────────────────────────────────────

-- condiciones_salud
drop policy if exists salud_condiciones_salud_lectura on public.condiciones_salud;
drop policy if exists salud_condiciones_salud_insert on public.condiciones_salud;
drop policy if exists salud_condiciones_salud_update on public.condiciones_salud;
drop policy if exists salud_condiciones_salud_delete on public.condiciones_salud;

create policy salud_condiciones_salud_lectura on public.condiciones_salud
  for select to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy salud_condiciones_salud_insert on public.condiciones_salud
  for insert to authenticated
  with check (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy salud_condiciones_salud_update on public.condiciones_salud
  for update to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  )
  with check (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy salud_condiciones_salud_delete on public.condiciones_salud
  for delete to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );

-- respuestas_sesion
drop policy if exists salud_respuestas_sesion_select on public.respuestas_sesion;
drop policy if exists salud_respuestas_sesion_insert on public.respuestas_sesion;
drop policy if exists salud_respuestas_sesion_update on public.respuestas_sesion;
drop policy if exists salud_respuestas_sesion_delete on public.respuestas_sesion;

create policy salud_respuestas_sesion_select on public.respuestas_sesion
  for select to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy salud_respuestas_sesion_insert on public.respuestas_sesion
  for insert to authenticated
  with check (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy salud_respuestas_sesion_update on public.respuestas_sesion
  for update to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  )
  with check (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy salud_respuestas_sesion_delete on public.respuestas_sesion
  for delete to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );

-- respuestas_cuestionario_salud
drop policy if exists respuestas_cuestionario_salud_lectura on public.respuestas_cuestionario_salud;
drop policy if exists respuestas_cuestionario_salud_insert on public.respuestas_cuestionario_salud;
drop policy if exists respuestas_cuestionario_salud_update on public.respuestas_cuestionario_salud;
drop policy if exists respuestas_cuestionario_salud_delete on public.respuestas_cuestionario_salud;

create policy respuestas_cuestionario_salud_lectura on public.respuestas_cuestionario_salud
  for select to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy respuestas_cuestionario_salud_insert on public.respuestas_cuestionario_salud
  for insert to authenticated
  with check (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy respuestas_cuestionario_salud_update on public.respuestas_cuestionario_salud
  for update to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  )
  with check (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy respuestas_cuestionario_salud_delete on public.respuestas_cuestionario_salud
  for delete to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );

-- valoraciones_iniciales_salud (solo lectura: escribe el service-role de la app
-- de la alumna)
drop policy if exists valoraciones_iniciales_salud_lectura on public.valoraciones_iniciales_salud;

create policy valoraciones_iniciales_salud_lectura on public.valoraciones_iniciales_salud
  for select to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );

-- notas_progreso (las cuatro de 20260913015653, que ya exigían consentimiento)
drop policy if exists salud_notas_progreso on public.notas_progreso;
drop policy if exists salud_notas_progreso_select on public.notas_progreso;
drop policy if exists salud_notas_progreso_insert on public.notas_progreso;
drop policy if exists salud_notas_progreso_update on public.notas_progreso;
drop policy if exists salud_notas_progreso_delete on public.notas_progreso;

create policy salud_notas_progreso_select on public.notas_progreso
  for select to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy salud_notas_progreso_insert on public.notas_progreso
  for insert to authenticated
  with check (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy salud_notas_progreso_update on public.notas_progreso
  for update to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  )
  with check (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );
create policy salud_notas_progreso_delete on public.notas_progreso
  for delete to authenticated
  using (
    studio_id = current_studio_id()
    and public.tiene_consentimiento_salud(socio_id)
    and (current_rol() = 'PROPIETARIO'
         or (current_rol() = 'INSTRUCTOR' and public.instructora_atiende_socia(socio_id)))
  );

-- ─── 3. Semáforo ────────────────────────────────────────────────────────────
--
-- Misma firma → mismo objeto función y mismo ACL; aun así se reafirman los
-- grants abajo y se verifica con `has_function_privilege` (ver
-- scripts/verify-rls-salud-por-alumna.sql).
-- Gotcha de `RETURNS TABLE(socio_id, nivel)`: dentro del cuerpo son variables,
-- así que toda columna de tabla va calificada (`cs.socio_id`).

create or replace function public.semaforo_salud_estudio(p_studio_id text)
returns table(socio_id text, nivel text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_rol text;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  if auth.uid() is not null then
    v_rol := public.current_rol();
    -- Falla CERRADA: sin rol resuelto no hay semáforo.
    if v_rol is null or v_rol not in ('PROPIETARIO', 'INSTRUCTOR', 'RECEPCION', 'MANAGER') then
      raise exception 'ROL_NO_AUTORIZADO';
    end if;
  end if;

  return query
  select
    cs.socio_id,
    case
      when bool_or(
        cs.severidad = 'ALTA'
        or exists (select 1 from unnest(cs.restricciones) r where r like 'NO\_%' escape '\')
      ) then 'ROJO'
      else 'AMBAR'
    end as nivel
  from condiciones_salud cs
  where cs.studio_id = p_studio_id and cs.estado = 'ACTIVA'
    and public.tiene_consentimiento_salud(cs.socio_id)
    and (v_rol is distinct from 'INSTRUCTOR' or public.instructora_atiende_socia(cs.socio_id))
  group by cs.socio_id;
end;
$function$;

revoke all on function public.semaforo_salud_estudio(text) from public;
revoke all on function public.semaforo_salud_estudio(text) from anon;
grant execute on function public.semaforo_salud_estudio(text) to authenticated, service_role;
