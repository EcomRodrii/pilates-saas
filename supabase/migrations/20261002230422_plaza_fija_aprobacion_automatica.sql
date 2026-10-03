-- Plazas fijas SUELTAS que pide la alumna: la aprobación la elige el estudio (manual, o automática por sus reglas).
--
-- Hasta ahora toda petición de plaza fija suelta (`solicitudes_plaza_fija`, tipo CREAR) esperaba a que alguien del estudio la
-- aprobara. Cada estudio trabaja distinto (decisión del fundador, 16-sep: Tentare no impone una forma de trabajar), así que
-- ahora lo elige:
--
--   · MANUAL (por defecto)  → como hasta ahora: nada cambia hasta que el estudio la apruebe.
--   · AUTOMATICA            → se aprueba sola SI pasa las reglas del estudio: cuota que cubre, nivel, sin duplicar, sin pasar
--                             del límite semanal de su cuota (eso nunca se aprueba solo), sin impago bloqueante, y la clase
--                             tiene aforo para que las plazas fijas no la llenen (`plaza_fija_auto_tope_pct`, sobre su aforo).
--                             Si falla alguna, queda pendiente para el estudio: la petición no se pierde.
--
-- El ajuste gobierna solo las SUELTAS. Las clases fijas con nombre siguen con su propio `aprobacion_automatica` y su tope duro.
--
-- Aditiva: el valor por defecto es el comportamiento de hoy, así que aplicarla antes que el código no cambia nada.

set lock_timeout = '5s';

alter table public.studios
  add column if not exists plaza_fija_aprobacion text not null default 'MANUAL',
  add column if not exists plaza_fija_auto_tope_pct smallint not null default 50;

alter table public.studios drop constraint if exists studios_plaza_fija_aprobacion_check;
alter table public.studios add constraint studios_plaza_fija_aprobacion_check
  check (plaza_fija_aprobacion in ('MANUAL', 'AUTOMATICA'));
alter table public.studios drop constraint if exists studios_plaza_fija_auto_tope_pct_check;
alter table public.studios add constraint studios_plaza_fija_auto_tope_pct_check
  check (plaza_fija_auto_tope_pct between 10 and 100);

comment on column public.studios.plaza_fija_aprobacion is
  'Peticiones de plaza fija suelta desde la app: MANUAL (por defecto, las aprueba el estudio) o AUTOMATICA (se aprueban solas si pasan sus reglas).';
comment on column public.studios.plaza_fija_auto_tope_pct is
  'Con aprobación AUTOMATICA: el porcentaje del aforo de una clase que pueden ocupar las plazas fijas antes de que las nuevas pasen a aprobación manual.';

-- La propietaria lo guarda desde Configuración con su sesión (RLS `owner_studios` limita la fila): sin el grant de columna el
-- UPDATE da 42501. Lo lee la app de la alumna con service-role, así que no hace falta grant de select.
grant update (plaza_fija_aprobacion, plaza_fija_auto_tope_pct) on public.studios to authenticated;

-- Dar una plaza fija SUELTA con tope de plazas, sin carreras. Dos peticiones a la vez para la misma franja se serializan con un
-- candado por franja y el recuento se hace dentro, así que las dos no pueden pasar del tope («el repo ya sufrió esa carrera»:
-- dos plazas en la misma franja). Es la misma cuenta de «quién ocupa el hueco» que `dar_plazas_clase_fija` (clases fijas con
-- nombre), que no sirve aquí: su candado sale de la clase fija y las sueltas no tienen. `returns jsonb` y no `returns table`:
-- las columnas de salida de `returns table` chocan con las de la consulta.
create or replace function public.dar_plaza_fija_con_cupo(
  p_studio_id text,
  p_fila      jsonb,
  p_cupo      integer
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_dia     smallint := (p_fila ->> 'dia_semana')::smallint;
  v_hora    time     := (p_fila ->> 'hora_inicio')::time;
  v_sala    text     := p_fila ->> 'sala_id';
  v_tipo    text     := nullif(p_fila ->> 'tipo_clase_id', '');
  v_ocupadas integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':franja:' || v_sala || ':' || v_dia::text || ':' || v_hora::text));

  -- Quién ocupa el hueco: ACTIVA o PAUSADA y vigente hoy; una plaza sin tipo cuenta para cualquier tipo de esa franja.
  select count(*) into v_ocupadas
  from plazas_fijas pf
  where pf.studio_id = p_studio_id
    and pf.estado in ('ACTIVA', 'PAUSADA')
    and (pf.vigencia_hasta is null or pf.vigencia_hasta >= (now() at time zone 'Europe/Madrid')::date)
    and pf.sala_id = v_sala
    and pf.dia_semana = v_dia
    and pf.hora_inicio = v_hora
    and (pf.tipo_clase_id is null or v_tipo is null or pf.tipo_clase_id = v_tipo);

  if p_cupo is not null and v_ocupadas >= p_cupo then
    return jsonb_build_object('ok', false, 'codigo', 'SIN_CUPO', 'ocupadas', v_ocupadas, 'cupo', p_cupo);
  end if;

  insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, tipo_clase_id, spot_id, vigencia_desde, vigencia_hasta, estado)
  values (
    p_fila ->> 'id', p_studio_id, p_fila ->> 'socio_id', v_dia, v_hora, v_sala, v_tipo, nullif(p_fila ->> 'spot_id', ''),
    (p_fila ->> 'vigencia_desde')::date, nullif(p_fila ->> 'vigencia_hasta', '')::date, 'ACTIVA'
  );

  return jsonb_build_object('ok', true, 'id', p_fila ->> 'id');
end;
$function$;

-- Solo el servidor. `revoke ... from public` NO basta: `pg_default_acl` da EXECUTE directo a anon y authenticated.
revoke all on function public.dar_plaza_fija_con_cupo(text, jsonb, integer) from public;
revoke all on function public.dar_plaza_fija_con_cupo(text, jsonb, integer) from anon;
revoke all on function public.dar_plaza_fija_con_cupo(text, jsonb, integer) from authenticated;
grant execute on function public.dar_plaza_fija_con_cupo(text, jsonb, integer) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.dar_plaza_fija_con_cupo(text,jsonb,integer)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.dar_plaza_fija_con_cupo(text,jsonb,integer)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('service_role', 'public.dar_plaza_fija_con_cupo(text,jsonb,integer)'::regprocedure, 'EXECUTE') then
    raise exception 'dar_plaza_fija_con_cupo tiene permisos que no debe';
  end if;
  if not has_column_privilege('authenticated', 'public.studios', 'plaza_fija_aprobacion', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.studios', 'plaza_fija_auto_tope_pct', 'UPDATE') then
    raise exception 'la propietaria no puede guardar el ajuste de aprobación';
  end if;
end $$;
