-- Una clienta puede tener más de una fila compatible con la misma franja si
-- sus plazas están acotadas a tipos de clase distintos. Ocupa una sola plaza
-- física; el límite de plazas fijas debe contar personas únicas.
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

  -- Una alumna solo ocupa un sitio aunque tenga más de una plaza compatible.
  select count(distinct pf.socio_id) into v_ocupadas
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

-- Conservar el acceso exclusivamente de service_role fijado por la migración
-- original (CREATE OR REPLACE no cambia sus permisos).
revoke all on function public.dar_plaza_fija_con_cupo(text, jsonb, integer) from public;
revoke all on function public.dar_plaza_fija_con_cupo(text, jsonb, integer) from anon;
revoke all on function public.dar_plaza_fija_con_cupo(text, jsonb, integer) from authenticated;
grant execute on function public.dar_plaza_fija_con_cupo(text, jsonb, integer) to service_role;
