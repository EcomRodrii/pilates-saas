-- 38ª pasada de auditoría (2026-09-09): MANAGER no veía ni el color del
-- semáforo de salud (`puedeVerSemaforo` en lib/permisos-reglas.ts), pese a
-- gestionar la ficha completa de cualquier clienta y el calendario — más
-- autoridad operativa que RECEPCIÓN, que ya lo ve desde el 30-jul-2026
-- (e1d66301). No había ninguna decisión documentada que excluyera a MANAGER
-- a propósito; era un descuido de cuando se añadió ese rol. Confirmado con
-- el usuario antes de aplicar (no es una decisión que se pueda tomar sola).
--
-- Mismo criterio que `20260729170000_semaforo_salud_estudio.sql` (que ya
-- añadió RECEPCION): CREATE OR REPLACE con la misma firma conserva los
-- GRANT existentes.
create or replace function public.semaforo_salud_estudio(p_studio_id text)
returns table(socio_id text, nivel text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.validar_studio_mismatch(p_studio_id);
  if auth.uid() is not null and current_rol() not in ('PROPIETARIO', 'INSTRUCTOR', 'RECEPCION', 'MANAGER') then
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
