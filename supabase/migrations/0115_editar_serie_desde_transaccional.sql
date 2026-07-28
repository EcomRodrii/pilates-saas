-- ═══════════════════════════════════════════════════════════════════════════
-- 0115 · TENTARE — editar "esta y las siguientes" de una serie, todo-o-nada
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Follow-up de #415. editarSerieDesde aplicaba el cambio en VARIAS escrituras no
-- transaccionales: un UPDATE en lote de los campos uniformes (tipo/sala/instructora/
-- aforo/notas) + un UPDATE por sesión para la hora (que varía por fecha). #415 ya
-- lo hizo escribe-primero, así que un fallo dejó de pasar en silencio. Pero el
-- fallo PARCIAL seguía siendo malo: si el lote iba bien y una de las horas fallaba
-- (p. ej. solape GiST solo en los lunes), la base de datos quedaba con MEDIA serie
-- movida y media no, mientras la pantalla se deshacía entera → BD y panel divergían
-- hasta la siguiente recarga.
--
-- Esta RPC lo hace en UNA transacción: un único UPDATE sobre todas las sesiones de
-- la serie desde la origen. Si CUALQUIER fila viola sesiones_instructor_sin_solape
-- (0048) o sesiones_sala_sin_solape (0074), Postgres aborta el statement entero y
-- la función revienta con 23P01 (exclusion_violation) → rollback completo, cero
-- estado parcial. El cliente traduce ese 23P01 a "esa sala o instructora ya tiene
-- una clase a esa hora" (lib/errores.ts) sin tocar nada más.
--
-- Las sesiones de una misma serie caen en fechas distintas, así que mover todas a
-- la misma hora de pared NUNCA las solapa ENTRE ELLAS (rangos absolutos distintos);
-- el único solape posible es contra clases AJENAS a la serie, que es justo lo que
-- se quiere cazar.
--
-- La hora se reconstruye anclada a Europe/Madrid, como el resto del sistema
-- (plazas fijas 0084, límite semanal 0105): se toma la FECHA local de cada sesión
-- y se le pega la nueva hora de pared. `AT TIME ZONE` cruza el horario de verano
-- correctamente (dos sesiones de la misma serie con la misma hora de pared quedan
-- con offset distinto si una cae en invierno y otra en verano). El espejo en TS
-- (lib/serie-horario.ts) calcula lo mismo para el pintado optimista.
--
-- Guard multi-inquilino STUDIO_MISMATCH + filtro studio_id en el UPDATE, igual que
-- reservar_plaza/crear_recuperacion: SECURITY DEFINER pero acotada al estudio del
-- que llama. Sin serie_id (sesión suelta) actúa solo sobre la propia sesión, mismo
-- criterio que sesionesDeSerieDesde en el cliente.
--
-- Reversible: DROP FUNCTION public.editar_serie_desde(...). No toca datos ni
-- esquema — solo crea la función.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.editar_serie_desde(
  p_studio_id        text,
  p_sesion_origen_id text,
  p_tipo_clase_id    text,
  p_sala_id          text,
  p_instructor_id    text,
  p_aforo_maximo     integer,
  p_notas            text,
  p_hora_inicio      text,   -- 'HH:MM' hora de pared (Europe/Madrid)
  p_hora_fin         text    -- 'HH:MM'
)
returns integer              -- nº de sesiones actualizadas
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz     constant text := 'Europe/Madrid';
  v_serie  text;
  v_inicio timestamptz;
  v_count  integer;
begin
  -- Guard multi-inquilino: un usuario autenticado solo toca su propio estudio.
  -- (service_role, sin auth.uid(), lo salta — igual que el resto de RPC.)
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  -- La sesión origen fija el corte: su serie_id y su inicio ("esta y las que
  -- vengan después"). Debe ser de este estudio.
  select serie_id, inicio into v_serie, v_inicio
    from sesiones
   where id = p_sesion_origen_id and studio_id = p_studio_id;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  -- UN solo UPDATE = atómico. Campos uniformes + hora reconstruida por sesión
  -- (mantiene la FECHA local de cada una y le pone la hora nueva, en Madrid).
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
$$;

-- Anon NO debe poder ejecutarlo. Una función nueva se crea con EXECUTE a PUBLIC
-- por defecto (el proyecto no revoca por defecto), y el guard STUDIO_MISMATCH solo
-- actúa con auth.uid() presente → un anónimo lo saltaría y podría reescribir las
-- clases de CUALQUIER estudio vía /rest/v1/rpc. Se revoca PUBLIC y se da solo a
-- authenticated + service_role, igual que reservar_plaza/crear_recuperacion.
revoke execute on function public.editar_serie_desde(text, text, text, text, text, integer, text, text, text) from public;
grant execute on function public.editar_serie_desde(text, text, text, text, text, integer, text, text, text)
  to authenticated, service_role;
