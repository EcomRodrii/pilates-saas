-- Solo se extraen los dos checks de semántica IDÉNTICA en todas partes
-- (studio_mismatch, socio pertenece al studio). El check de instructor se
-- deja inline a propósito: aquí es obligatorio (RAISE si p_instructor_id es
-- NULL, porque `id = NULL` nunca es true), mientras que en
-- editar_serie_desde el instructor es opcional — un helper compartido con
-- semánticas de NULL distintas es más riesgo que ahorro para dos sitios.

create or replace function public.reservar_cita(p_id text, p_studio_id text, p_socio_id text, p_instructor_id text, p_servicio_id text, p_tipo text, p_inicio timestamp with time zone, p_fin timestamp with time zone, p_precio numeric, p_notas text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_conflict integer;
begin
  perform public.validar_studio_mismatch(p_studio_id);
  perform public.validar_socio_del_studio(p_socio_id, p_studio_id);

  if not exists (select 1 from instructores where id = p_instructor_id and studio_id = p_studio_id) then
    raise exception 'INSTRUCTOR_NO_PERTENECE_AL_STUDIO';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_studio_id || ':' || p_instructor_id));

  select count(*) into v_conflict from public.citas c
  where c.instructor_id = p_instructor_id
    and c.estado in ('PENDIENTE','CONFIRMADA')
    and tstzrange(c.inicio, c.fin) && tstzrange(p_inicio, p_fin);
  if v_conflict > 0 then return 'CONFLICTO'; end if;

  select count(*) into v_conflict from public.sesiones s
  where s.instructor_id = p_instructor_id
    and coalesce(s.cancelada, false) = false
    and tstzrange(s.inicio, s.fin) && tstzrange(p_inicio, p_fin);
  if v_conflict > 0 then return 'CONFLICTO'; end if;

  insert into public.citas
    (id, studio_id, socio_id, instructor_id, servicio_id, tipo, inicio, fin, precio, notas, estado, pagada)
  values
    (p_id, p_studio_id, p_socio_id, p_instructor_id, p_servicio_id, p_tipo, p_inicio, p_fin, p_precio, p_notas, 'CONFIRMADA', false);

  return 'CONFIRMADA';
end;
$function$;
