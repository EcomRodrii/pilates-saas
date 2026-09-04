-- ─────────────────────────────────────────────────────────────────────────────
-- `plazas_fijas` se ancla por SLOT (sala + día de la semana + hora local +
-- tipo opcional, 0083) y `materializar_plazas_fijas` empareja sesiones futuras
-- por ese slot. Nada movía el ancla cuando el estudio movía la clase: tras un
-- "editar esta y las siguientes" que cambiara hora o sala, todas las plazas
-- fijas de ese slot dejaban de materializar EN SILENCIO — sin sesión que
-- encaje no hay fila en el JOIN, y `plazas_fijas_sin_materializar` (mismo
-- JOIN) tampoco avisaba a nadie.
--
-- Esta migración hace que `editar_serie_desde` mueva con la serie las plazas
-- fijas ancladas a los slots que va a tocar. Decisiones:
--
--  · Solo cuando se edita una SERIE. La RPC también admite una clase suelta
--    (`v_serie is null` → toca solo `p_sesion_origen_id`), y mover una clase
--    suelta es una excepción puntual, no un cambio del compromiso semanal: la
--    reserva ya materializada viaja con la sesión porque cuelga de
--    `sesion_id`, y la plaza se queda donde estaba a propósito. Mismo criterio
--    que el arrastre en el calendario. Por eso tampoco es un trigger por fila
--    sobre `sesiones`: una fila no sabe si es "esta y las siguientes".
--  · La RPC NUNCA cambia el día de la semana (conserva la fecha local de cada
--    sesión): aquí se cubre hora / sala / tipo. El cambio de día solo existe
--    arrastrando UNA clase, y ese caso lo cubren la bandeja y la edición de la
--    plaza en la ficha.
--  · Dentro de la RPC, ANTES del update de `sesiones` y en la MISMA
--    transacción: si el update falla (solape 23P01), las plazas también hacen
--    rollback y ninguna queda apuntando a un horario que no llegó a existir.
--  · Si el slot viejo SIGUE teniendo clase más allá de la fecha del cambio por
--    sesiones ajenas a este update (otra serie —el trimestre siguiente—,
--    sueltas importadas), la plaza NO se mueve: sacarla de un slot con clase
--    sería decidir por la propietaria. Se queda, y ella decide desde la ficha.
--  · Se PARTE en dos filas solo si quedan clases futuras en el slot viejo
--    ANTES de la fecha del cambio (editar "desde" una clase de dentro de unas
--    semanas): el tramo viejo cierra `vigencia_hasta` la víspera y el nuevo
--    nace en el slot nuevo con el MISMO `creada_en` — la materialización
--    prioriza por antigüedad cuando falta aforo, y una fila con `now()` le
--    quitaría el turno a la socia. Si no queda nada en el slot viejo (el caso
--    normal: editar desde la próxima clase) se actualiza en sitio.
--  · Se mueven las ACTIVAS y las PAUSADAS (una plaza en pausa sigue siendo un
--    compromiso sobre ese slot; al reanudarla desde el portal debe apuntar a
--    la clase viva). Las BAJA no.
--  · `spot_id`: el sitio pertenece a la sala, así que si cambia la sala no
--    viaja. Y si al escribir salta `plazas_fijas_spot_sin_solape` (otra socia
--    ya tiene ese sitio en el slot nuevo), se reintenta SIN sitio: nunca se
--    aborta el cambio de horario por un choque de sitio, mismo criterio que
--    materializar_plazas_fijas. ⚠️ Con una diferencia que conviene tener
--    presente: allí se pierde el sitio en UNA reserva; aquí se pierde en la
--    FILA, de forma permanente, y solo se ve en la ficha de la socia.
--  · Plaza acotada a un tipo de clase: si la serie cambia de tipo, la plaza
--    sigue al tipo nuevo. Sin acotar, sigue sin acotar.
--  · SECURITY DEFINER no pasa la RLS de `plazas_fijas`: todo va acotado por
--    `pf.studio_id = p_studio_id` (ya validado contra la sesión por
--    validar_studio_mismatch).
--
-- Firma SIN cambios (los mismos 9 argumentos): `create or replace` conserva los
-- grants de 0115. Se re-afirman igualmente y se verifica con
-- has_function_privilege al final, por el gotcha de grants documentado en
-- .claude/tentare-os.md (van cuatro veces en el repo).
--
-- Reversible: recrear la función como en 20260730012700 (sin el bloque de
-- plazas fijas).
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
  -- plazas fijas
  v_fecha_desde date;
  v_slot        record;
  v_pf          record;
  v_ajenas_desde_cambio boolean;
  v_ajenas_antes_cambio boolean;
  v_nuevo_tipo  text;
  v_nuevo_spot  text;
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

  -- ── Plazas fijas ancladas a los slots que se van a mover ──────────────────
  -- Va ANTES del update de sesiones (se necesitan sus valores de ahora, que el
  -- update pisa) y en la misma transacción (ver cabecera). Solo series, y solo
  -- con sala destino: una plaza fija se ancla a una sala (NOT NULL), sin ella
  -- no hay a dónde moverla.
  if v_serie is not null and p_sala_id is not null then
    v_fecha_desde := (v_inicio at time zone v_tz)::date;

    for v_slot in
      select distinct
        s.sala_id,
        (s.inicio at time zone v_tz)::time                       as hora_inicio,
        s.tipo_clase_id,
        extract(dow from s.inicio at time zone v_tz)::smallint   as dia_semana
      from sesiones s
      where s.studio_id = p_studio_id
        and s.inicio >= v_inicio
        and s.sala_id is not null
        and s.serie_id = v_serie
    loop
      -- Sesiones futuras del slot viejo AJENAS a este update (otra serie,
      -- sueltas, o de esta misma serie pero anteriores al origen): son las
      -- que dicen si ese slot sigue teniendo clase, y desde cuándo.
      select
        coalesce(bool_or((s2.inicio at time zone v_tz)::date >= v_fecha_desde), false),
        coalesce(bool_or((s2.inicio at time zone v_tz)::date <  v_fecha_desde), false)
      into v_ajenas_desde_cambio, v_ajenas_antes_cambio
      from sesiones s2
      where s2.studio_id = p_studio_id
        and s2.inicio >= now()
        and coalesce(s2.cancelada, false) = false
        and s2.sala_id = v_slot.sala_id
        and (s2.inicio at time zone v_tz)::time = v_slot.hora_inicio
        and extract(dow from s2.inicio at time zone v_tz) = v_slot.dia_semana
        and (s2.serie_id is distinct from v_serie or s2.inicio < v_inicio);

      -- El slot viejo sigue con clase más allá del cambio: no se toca nada.
      if v_ajenas_desde_cambio then
        continue;
      end if;

      for v_pf in
        select pf.*
        from plazas_fijas pf
        where pf.studio_id = p_studio_id
          and pf.estado in ('ACTIVA', 'PAUSADA')
          and pf.sala_id = v_slot.sala_id
          and pf.dia_semana = v_slot.dia_semana
          and pf.hora_inicio = v_slot.hora_inicio
          and (pf.tipo_clase_id is null or pf.tipo_clase_id = v_slot.tipo_clase_id)
          and (pf.vigencia_hasta is null or pf.vigencia_hasta >= v_fecha_desde)
          -- Solo si el slot cambia DE VERDAD para esta plaza (cambiar solo la
          -- instructora o el aforo no mueve nada).
          and (
            pf.sala_id <> p_sala_id
            or pf.hora_inicio <> p_hora_inicio::time
            or (pf.tipo_clase_id is not null and pf.tipo_clase_id is distinct from p_tipo_clase_id)
          )
        order by pf.creada_en, pf.id
      loop
        v_nuevo_tipo := case when v_pf.tipo_clase_id is null then null else p_tipo_clase_id end;
        v_nuevo_spot := case when v_pf.sala_id = p_sala_id then v_pf.spot_id else null end;

        if v_ajenas_antes_cambio and v_pf.vigencia_desde < v_fecha_desde then
          -- Partir: el tramo viejo termina la víspera; el nuevo hereda estado,
          -- fin de vigencia y ANTIGÜEDAD.
          update plazas_fijas set vigencia_hasta = v_fecha_desde - 1 where id = v_pf.id;
          begin
            insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, tipo_clase_id, spot_id, vigencia_desde, vigencia_hasta, estado, creada_en)
            values ('pf-' || gen_random_uuid()::text, v_pf.studio_id, v_pf.socio_id, v_pf.dia_semana, p_hora_inicio::time, p_sala_id,
                    v_nuevo_tipo, v_nuevo_spot, v_fecha_desde, v_pf.vigencia_hasta, v_pf.estado, v_pf.creada_en);
          exception when exclusion_violation then
            insert into plazas_fijas (id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, tipo_clase_id, spot_id, vigencia_desde, vigencia_hasta, estado, creada_en)
            values ('pf-' || gen_random_uuid()::text, v_pf.studio_id, v_pf.socio_id, v_pf.dia_semana, p_hora_inicio::time, p_sala_id,
                    v_nuevo_tipo, null, v_fecha_desde, v_pf.vigencia_hasta, v_pf.estado, v_pf.creada_en);
          end;
        else
          -- En sitio: mismo id, misma antigüedad.
          begin
            update plazas_fijas
               set hora_inicio = p_hora_inicio::time, sala_id = p_sala_id, tipo_clase_id = v_nuevo_tipo, spot_id = v_nuevo_spot
             where id = v_pf.id;
          exception when exclusion_violation then
            update plazas_fijas
               set hora_inicio = p_hora_inicio::time, sala_id = p_sala_id, tipo_clase_id = v_nuevo_tipo, spot_id = null
             where id = v_pf.id;
          end;
        end if;
      end loop;
    end loop;
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

-- Misma firma → mismos grants (0115). Se re-afirman y se comprueban: una función
-- SECURITY DEFINER que reescribe clases y plazas fijas no puede quedar
-- ejecutable por anon bajo ningún concepto.
revoke execute on function public.editar_serie_desde(text, text, text, text, text, integer, text, text, text) from public, anon;
grant  execute on function public.editar_serie_desde(text, text, text, text, text, integer, text, text, text) to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.editar_serie_desde(text, text, text, text, text, integer, text, text, text)', 'EXECUTE') then
    raise exception 'editar_serie_desde: anon NO debe poder ejecutarla';
  end if;
  if not has_function_privilege('authenticated', 'public.editar_serie_desde(text, text, text, text, text, integer, text, text, text)', 'EXECUTE') then
    raise exception 'editar_serie_desde: authenticated tiene que poder ejecutarla (la llama el panel)';
  end if;
end $$;
