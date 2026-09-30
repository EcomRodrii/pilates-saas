-- Tope de recuperaciones sin usar, configurable (Fase 2 de «Cómo reservan mis alumnas»).
--
-- `studios.recuperacion_max_vivas`: cuántas recuperaciones sin usar (DISPONIBLE y
-- sin caducar) puede tener a la vez cada alumna. 4 = lo de siempre: ningún
-- estudio ve un cambio hasta que lo toca. De 1 a 20 (el 20 coincide con
-- MAX_RECUPERACIONES_POR_FILA de la importación); ni «sin tope» —la caducidad ya
-- limita y un NULL añadiría un tercer significado a cada camino que maneja «ya
-- tiene el máximo»— ni 0 —dejaría sin compensación, en silencio, la baja de una
-- plaza fija y los canjes—.
--
-- Bajarlo no quita nada: quien ya tenga más las conserva; solo no se le da otra
-- hasta que baje del tope.
--
-- ⚠️ El cuerpo de `crear_recuperacion` sale de la definición VIVA en producción
-- (pg_get_functiondef, 30-sep-2026: ya con `es_llamada_servicio`, de
-- 20260913233644), no de la última migración del repo que la define. Solo
-- cambian dos cosas: lee `recuperacion_max_vivas` y compara con él.

alter table public.studios
  add column if not exists recuperacion_max_vivas integer not null default 4;

alter table public.studios
  drop constraint if exists studios_recuperacion_max_vivas_rango;
alter table public.studios
  add constraint studios_recuperacion_max_vivas_rango
    check (recuperacion_max_vivas >= 1 and recuperacion_max_vivas <= 20);

comment on column public.studios.recuperacion_max_vivas is
  'Recuperaciones sin usar (DISPONIBLE y sin caducar) que puede tener a la vez cada alumna. 4 = lo de siempre. Lo aplica crear_recuperacion bajo su candado. Bajarlo no quita las que ya tiene.';

-- `studios` da UPDATE por columnas a authenticated (20260910171150).
grant update (recuperacion_max_vivas) on public.studios to authenticated;

-- Misma firma: `create or replace` conserva dueño y permisos. Se declaran igual,
-- porque así queda escrito qué pasa con `anon`.
create or replace function public.crear_recuperacion(
  p_id text, p_studio_id text, p_socio_id text, p_origen_reserva_id text, p_motivo text, p_caduca_el date
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tipo text;
  v_dias int;
  v_max int;
  v_vivas int;
  v_caduca date;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  if not public.es_llamada_servicio() and not public.puede_gestionar_clientas() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_caduca_el is not null and p_caduca_el < current_date then
    raise exception 'CADUCIDAD_EN_PASADO';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':recuperaciones:' || p_socio_id));

  if p_origen_reserva_id is not null and exists (
    select 1 from recuperaciones
     where studio_id = p_studio_id and socio_id = p_socio_id
       and origen_reserva_id = p_origen_reserva_id
  ) then
    return 'YA_EXISTE';
  end if;

  select recuperacion_caducidad_tipo, recuperacion_caducidad_dias, recuperacion_max_vivas
    into v_tipo, v_dias, v_max
    from studios where id = p_studio_id;

  select count(*) into v_vivas
    from recuperaciones
   where socio_id = p_socio_id and studio_id = p_studio_id
     and estado = 'DISPONIBLE' and caduca_el >= current_date;
  if v_vivas >= coalesce(v_max, 4) then
    return 'TOPE';
  end if;

  v_caduca := coalesce(
    p_caduca_el,
    calcular_caduca_recuperacion(current_date, coalesce(v_tipo, 'FIN_MES_SIGUIENTE'), v_dias)
  );

  insert into recuperaciones (id, studio_id, socio_id, origen_reserva_id, motivo, caduca_el, estado)
    values (p_id, p_studio_id, p_socio_id, p_origen_reserva_id, p_motivo, v_caduca, 'DISPONIBLE');
  return 'CREADA';
end;
$$;

revoke all on function public.crear_recuperacion(text, text, text, text, text, date) from public, anon;
grant execute on function public.crear_recuperacion(text, text, text, text, text, date) to authenticated, service_role;

do $verificacion$
begin
  if has_function_privilege('anon', 'public.crear_recuperacion(text, text, text, text, text, date)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.crear_recuperacion(text, text, text, text, text, date)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.crear_recuperacion(text, text, text, text, text, date)', 'EXECUTE') then
    raise exception 'crear_recuperacion: los permisos no son los esperados';
  end if;
  if not has_column_privilege('authenticated', 'public.studios', 'recuperacion_max_vivas', 'UPDATE') then
    raise exception 'studios.recuperacion_max_vivas: no se podría guardar';
  end if;
end
$verificacion$;
