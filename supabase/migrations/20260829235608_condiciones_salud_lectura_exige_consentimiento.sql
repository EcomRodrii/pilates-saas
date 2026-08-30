-- C-3 (auditoría 29-ago-2026): `tiene_consentimiento_salud(socio_id)` solo
-- estaba conectada al INSERT de `condiciones_salud` (0138/20260804201830).
-- Ninguna policy de SELECT/UPDATE/DELETE la comprobaba, y `semaforo_salud_estudio`
-- (SECURITY DEFINER, bypasea RLS) tampoco — verificado en producción antes de
-- escribir esto: 2 de 4 condiciones ACTIVAS son EMBARAZO de socias con
-- `consentimiento_salud_fecha` NULL, y ambas contaban para el semáforo
-- ROJO/ÁMBAR visto por RECEPCIÓN.
--
-- No es un borrado retroactivo: la fila sigue en la tabla, solo deja de ser
-- legible mientras no haya consentimiento vigente. El flujo para pedirlo YA
-- EXISTE (components/socios/ficha-salud.tsx, `ConsentimientoSaludDialog` +
-- `confirmarConsentimiento`) — hoy solo se dispara al intentar AÑADIR una
-- condición nueva; en cuanto se registra el consentimiento (mismo flujo, sin
-- cambios), las condiciones ya existentes de esa socia vuelven a ser legibles
-- de inmediato porque la policy se reevalúa en cada lectura, no en el
-- momento de insertar.

drop policy if exists salud_condiciones_salud_lectura on public.condiciones_salud;
create policy salud_condiciones_salud_lectura on public.condiciones_salud
  for select to authenticated
  using (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

drop policy if exists salud_condiciones_salud_update on public.condiciones_salud;
create policy salud_condiciones_salud_update on public.condiciones_salud
  for update to authenticated
  using      (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  )
  with check (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

drop policy if exists salud_condiciones_salud_delete on public.condiciones_salud;
create policy salud_condiciones_salud_delete on public.condiciones_salud
  for delete to authenticated
  using (
    studio_id = current_studio_id()
    and current_rol() in ('PROPIETARIO', 'INSTRUCTOR')
    and public.tiene_consentimiento_salud(socio_id)
  );

-- Gemelo: SECURITY DEFINER lee `condiciones_salud` saltándose la RLS de
-- arriba por completo — sin este filtro, el semáforo seguiría delatando
-- ROJO/ÁMBAR a RECEPCIÓN (que ni siquiera tiene SELECT directo en la tabla)
-- para una condición sin consentimiento. Misma firma: CREATE OR REPLACE
-- conserva los GRANT.
create or replace function public.semaforo_salud_estudio(p_studio_id text)
returns table(socio_id text, nivel text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.validar_studio_mismatch(p_studio_id);
  if auth.uid() is not null and current_rol() not in ('PROPIETARIO', 'INSTRUCTOR', 'RECEPCION') then
    raise exception 'ROL_NO_AUTORIZADO';
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
  group by cs.socio_id;
end;
$function$;
