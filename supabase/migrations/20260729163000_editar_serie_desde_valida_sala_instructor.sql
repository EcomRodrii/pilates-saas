-- editar_serie_desde comprobaba STUDIO_MISMATCH y que la sesión origen fuera
-- del estudio, pero nunca que p_sala_id/p_instructor_id pertenecieran a ese
-- mismo estudio — el mismo patrón que esta sesión ya cerró hoy en
-- reservar_plaza/ajustar_creditos/crear_recuperacion/reservar_cita
-- (20260729141500_valida_socio_pertenece_a_studio_en_rpcs.sql), aquí se había
-- quedado fuera de esa tanda. Un usuario autenticado de un estudio podía
-- anclar sus sesiones a una sala/instructora de OTRO estudio (adivinando o
-- enumerando ids), contaminando las constraints de solape de ese estudio
-- ajeno con sesiones que no son suyas.

create or replace function public.editar_serie_desde(p_studio_id text, p_sesion_origen_id text, p_tipo_clase_id text, p_sala_id text, p_instructor_id text, p_aforo_maximo integer, p_notas text, p_hora_inicio text, p_hora_fin text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz     constant text := 'Europe/Madrid';
  v_serie  text;
  v_inicio timestamptz;
  v_count  integer;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  select serie_id, inicio into v_serie, v_inicio
    from sesiones
   where id = p_sesion_origen_id and studio_id = p_studio_id;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  if p_sala_id is not null and not exists (select 1 from salas where id = p_sala_id and studio_id = p_studio_id) then
    raise exception 'SALA_NO_PERTENECE_AL_STUDIO';
  end if;

  if p_instructor_id is not null and not exists (select 1 from instructores where id = p_instructor_id and studio_id = p_studio_id) then
    raise exception 'INSTRUCTOR_NO_PERTENECE_AL_STUDIO';
  end if;

  if p_tipo_clase_id is not null and not exists (select 1 from tipos_clase where id = p_tipo_clase_id and studio_id = p_studio_id) then
    raise exception 'TIPO_CLASE_NO_PERTENECE_AL_STUDIO';
  end if;

  update sesiones s
     set tipo_clase_id = p_tipo_clase_id,
         sala_id       = p_sala_id,
         instructor_id = p_instructor_id,
         aforo_maximo  = p_aforo_maximo,
         notas         = p_notas,
         inicio        = (((s.inicio at time zone v_tz)::date + p_hora_inicio::time) at time zone v_tz),
         fin           = (((s.inicio at time zone v_tz)::date + p_hora_fin::time)    at time zone v_tz)
   where s.studio_id = p_studio_id
     and s.inicio >= v_inicio
     and (
       (v_serie is not null and s.serie_id = v_serie)
       or (v_serie is null and s.id = p_sesion_origen_id)
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
