-- R-7 (auditoría 22-sep): `confirmar_sustitucion` no comprobaba que la clase
-- fuera futura, ni que la sesión no estuviera cancelada, ni que la sustituta
-- de verdad cambiara algo. El conflicto de horario ya estaba bien cubierto
-- (EXCLUDE USING gist real, sin tocar).
--
-- La ausencia de "clase futura" YA estaba compensada por DOS copias
-- divergentes en TypeScript (lib/sustituciones/responder.ts y
-- app/api/sustituciones/route.ts, ambas con el comentario "La RPC
-- confirmar_sustitucion no comprueba si la clase ya empezó") — un patrón de
-- "gemelos divergentes" documentado como deuda en el mapa de la propia
-- auditoría, y con una ventana TOCTOU real entre esa comprobación en TS y la
-- llamada a la RPC. Esta migración mueve la comprobación a la ÚNICA fuente
-- de verdad (la BD decide una vez, mismo criterio que D-1..D-5) — las dos
-- comprobaciones en TS se quedan como atajo de UX rápido (mensaje amigable
-- antes de llamar a la RPC), y la RPC pasa a ser el backstop autoritativo
-- que de verdad cierra la carrera.
--
-- Motivos nuevos, reutilizando nombres ya establecidos en el repo
-- (lib/notifications/emit.ts ya usa 'clase_ya_empezada'/'clase_cancelada'
-- para el mismo concepto en otro flujo): 'clase_ya_empezada',
-- 'clase_cancelada', 'sin_cambio'. Los tres caen al fallback genérico ya
-- existente en los tres consumidores (panel, app, enlace público) sin
-- necesitar tocarlos — ninguno tenía tampoco un mensaje específico para
-- 'clase_ya_empezada' cuando la RPC lo devolvía antes indirectamente.
--
-- Verificado en vivo con execute_sql+ROLLBACK antes de aplicar: los tres
-- casos nuevos devuelven su motivo exacto; los tres casos existentes
-- (ya_resuelta, conflicto_horario, candidata_no_valida) y el camino de éxito
-- siguen igual.
--
-- Sin SECURITY DEFINER (invoker) y sin cambio de firma: no aplica el
-- contrato de grants sobre anon ni el gotcha de firma nueva.

create or replace function public.confirmar_sustitucion(p_sustitucion_id text, p_instructor_id text, p_studio_id text, p_aprobada_por uuid default null::uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sesion text;
  v_inicio timestamptz;
  v_cancelada boolean;
  v_instructor_actual text;
begin
  if not exists (
    select 1 from public.instructores i
    where i.id = p_instructor_id and i.studio_id = p_studio_id and coalesce(i.activo, true)
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'candidata_no_valida');
  end if;

  begin
    -- Reclama la sustitución con lock ANTES de decidir nada de la sesión:
    -- mismo candado que ya usaba el UPDATE original (compare-and-set por
    -- estado), pero ahora hay que mirar la sesión antes de comprometerse.
    select s.sesion_id into v_sesion
      from public.sustituciones s
     where s.id = p_sustitucion_id and s.studio_id = p_studio_id
       and s.estado in ('buscando', 'pendiente_aprobacion', 'contactando', 'agotada')
     for update;

    if v_sesion is null then
      return jsonb_build_object('ok', false, 'motivo', 'ya_resuelta');
    end if;

    select ss.inicio, coalesce(ss.cancelada, false), ss.instructor_id
      into v_inicio, v_cancelada, v_instructor_actual
      from public.sesiones ss
     where ss.id = v_sesion and ss.studio_id = p_studio_id
     for update;

    if v_inicio is null or v_inicio <= now() then
      return jsonb_build_object('ok', false, 'motivo', 'clase_ya_empezada');
    end if;

    if v_cancelada then
      return jsonb_build_object('ok', false, 'motivo', 'clase_cancelada');
    end if;

    if v_instructor_actual = p_instructor_id then
      return jsonb_build_object('ok', false, 'motivo', 'sin_cambio');
    end if;

    update public.sustituciones
      set estado = 'confirmada',
          sustituta_final_id = p_instructor_id,
          aprobada_por = p_aprobada_por,
          aprobada_at = now(),
          resuelto_en = now()
    where id = p_sustitucion_id and studio_id = p_studio_id;

    update public.sesiones
      set instructor_id = p_instructor_id
    where id = v_sesion;

    return jsonb_build_object('ok', true, 'sesion_id', v_sesion);
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'motivo', 'conflicto_horario');
  end;
end;
$function$;
