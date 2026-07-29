-- puedeVerSemaforo(rol) (lib/permisos-reglas.ts) dice que RECEPCIÓN ve el
-- semáforo (solo el color, no el motivo) — pero la RLS de condiciones_salud
-- (salud_condiciones_salud_lectura) solo permite SELECT a PROPIETARIO/
-- INSTRUCTOR. Arreglar solo el gate del lado cliente (hecho en el commit
-- anterior) no bastaba: para RECEPCIÓN, `condicionesSalud` en el contexto
-- global llega SIEMPRE vacío desde el servidor, así que ningún cálculo local
-- puede producir un color. Esta RPC expone el MÍNIMO necesario —el nivel ya
-- calculado, nunca las condiciones ni el motivo— para que RECEPCIÓN pueda
-- pintar el punto de color sin poder leer la ficha clínica real.
--
-- Reproduce EXACTAMENTE la lógica de semaforo() en lib/ficha-clinica.ts:
-- ROJO si alguna condición ACTIVA tiene severidad ALTA o una restricción NO_*
-- (restricción "dura"); si no, AMBAR. VERDE (sin condiciones activas) no
-- genera fila — el llamante trata "sin fila" como VERDE, igual que el mapa
-- del cliente.

create or replace function public.semaforo_salud_estudio(p_studio_id text)
returns table(socio_id text, nivel text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
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
  group by cs.socio_id;
end;
$function$;

revoke all on function public.semaforo_salud_estudio(text) from public, anon;
grant execute on function public.semaforo_salud_estudio(text) to authenticated, service_role;
