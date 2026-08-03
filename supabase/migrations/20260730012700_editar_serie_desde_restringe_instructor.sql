-- ─────────────────────────────────────────────────────────────────────────────
-- `editar_serie_desde` (20260730106000) es SECURITY DEFINER: su UPDATE sobre
-- `sesiones` NO pasa por la RLS de la tabla en absoluto (ese es justo el punto
-- de SECURITY DEFINER). La 20260730109000 acota `sesiones_escritura_update`
-- para que una instructora solo pueda tocar sus propias clases — pero eso NO
-- protege esta función: sin un guard propio, cualquier instructora autenticada
-- podía llamarla directamente (está `grant`eada a `authenticated`) para editar
-- o reasignar "esta y las siguientes" de la serie de CUALQUIER instructora, en
-- CUALQUIER estudio que no fuera el suyo — el mismo hueco que la 109000 acaba
-- de cerrar en la tabla, reabierto por esta RPC.
--
-- Guard: si quien llama es INSTRUCTOR, (a) no puede reasignar la serie a otra
-- instructora (p_instructor_id debe seguir siendo la suya) y (b) TODAS las
-- sesiones del rango que la función va a tocar deben ser ya suyas. Mismo
-- criterio exacto que el WHERE del UPDATE de más abajo, para que lo que se
-- permite comprobar sea lo mismo que se va a escribir.
--
-- PROPIETARIO/MANAGER/RECEPCION: sin cambios (public.current_rol() <>
-- 'INSTRUCTOR', el guard no aplica).
--
-- Reversible: recrear la función como en 20260730106000 (sin el bloque nuevo).
-- ─────────────────────────────────────────────────────────────────────────────

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
  perform public.validar_studio_mismatch(p_studio_id);

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

  -- Una instructora solo puede editar SU serie y no puede reasignarla: mismo
  -- criterio que sesiones_escritura_update (20260730109000).
  if auth.uid() is not null and public.current_rol() = 'INSTRUCTOR' then
    if p_instructor_id is distinct from public.current_instructor_id() then
      raise exception 'NO_AUTORIZADO';
    end if;
    if exists (
      select 1 from sesiones s
      where s.studio_id = p_studio_id
        and s.inicio >= v_inicio
        and (
          (v_serie is not null and s.serie_id = v_serie)
          or (v_serie is null and s.id = p_sesion_origen_id)
        )
        and s.instructor_id is distinct from public.current_instructor_id()
    ) then
      raise exception 'NO_AUTORIZADO';
    end if;
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
