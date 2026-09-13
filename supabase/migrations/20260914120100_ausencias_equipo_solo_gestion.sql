-- Ausencias del equipo: el tipo y el motivo, solo para quien gestiona el equipo.
--
-- ANTES: `ausencias_gestion` FOR ALL USING (studio_id = current_studio_id()
-- AND current_rol() <> 'INSTRUCTOR'). Es decir, RECEPCION leía y escribía el
-- `tipo` (VACACIONES / BAJA_MEDICA / OTRO) y el `motivo` libre de cualquier
-- compañera. Una baja médica es un dato de salud de una empleada. Ensayado en
-- producción: la recepción de un estudio real veía la ausencia de otra persona.
--
-- DESPUÉS:
--   · `ausencias_gestion`: todo, pero solo si `puede_gestionar_equipo()`
--     (PROPIETARIO / MANAGER). Mismo criterio que `puedeGestionarEquipo` y que
--     ya exigía el POST/DELETE de `/api/equipo/ausencias`.
--   · `ausencias_propia` (sin cambios): la instructora, sobre las suyas.
--
-- ¿Y recepción, que asigna clases? Sigue sabiendo QUIÉN no está y QUÉ DÍAS, que
-- es lo único que necesita para no poner a nadie de vacaciones en el horario:
--   · el panel lee las ausencias por `/api/equipo/ausencias` (service-role),
--     que a recepción le devuelve instructora + fechas, sin tipo ni motivo;
--   · el motor de sustituciones mira `instructora_disponibilidad_excepciones`
--     (bloqueos diarios sin tipo ni motivo), que esta migración no toca.
-- Por eso no hace falta una vista ni una RPC nueva: nadie lee esta tabla desde
-- el cliente.

drop policy if exists ausencias_gestion on public.instructora_ausencias;
create policy ausencias_gestion on public.instructora_ausencias
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_equipo())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_equipo());

-- Avisos ya guardados. El push de «no puedo dar la clase» llevaba el motivo
-- entre paréntesis (`data.motivo` = ' (texto)', pegado al final de `body`), y
-- la ausencia programada ponía el tipo en el título. El código ya no los
-- escribe; esto limpia lo que quedó. Lo que ya salió por push no se puede
-- recoger.
update public.notification
   set body = replace(body, data->>'motivo', ''),
       data = data - 'motivo'
 where event_type = 'instructora.baja'
   and data ? 'motivo'
   and coalesce(data->>'motivo', '') <> '';

update public.notification
   set data = data - 'motivo'
 where event_type = 'instructora.baja'
   and data ? 'motivo';

update public.notification
   set title = 'Ausencia en el equipo',
       data = data - 'tipoTexto'
 where event_type = 'instructora.ausencia'
   and data ? 'tipoTexto';
