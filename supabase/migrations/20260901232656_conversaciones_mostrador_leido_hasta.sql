-- Auditoría 20ª pasada (1-sep) · F-15.
--
-- El mostrador (ALUMNA_MOSTRADOR) no tenía fila STAFF en
-- `conversacion_participantes` a propósito (20260825175506_abrir_conversacion_rpc:
-- "el mostrador se resuelve DINÁMICAMENTE... no se inserta ninguna fila STAFF" —
-- decisión de diseño ya cerrada, quien tiene puede_gestionar_calendario() ve y
-- escribe en CUALQUIER conversación del mostrador sin depender de una foto fija).
-- Consecuencia no vista hasta esta auditoría: `tieneSinLeer` (lib/mensajeria/
-- presentacion.ts) devuelve `false` en cuanto `leido_hasta === null` —
-- exactamente el caso del mostrador, siempre. Una socia escribe al mostrador (el
-- canal principal socia→estudio) y ningún contador se enciende para ningún
-- miembro del equipo, nunca.
--
-- Solución elegida (de las dos válidas que señala el informe): NO reabrir la
-- decisión de fila-STAFF-por-persona ya cerrada. En su lugar, una marca de
-- lectura COMPARTIDA en la propia conversación — coherente con que el
-- mostrador ya se trata como un buzón de equipo, no de una persona.
--
-- Mismo gotcha de grants ya documentado en este repo
-- (20260827103031_conversacion_participantes_solo_leido_hasta.sql):
-- `conversaciones` ya tenía GRANT UPDATE de TABLA ENTERA a `authenticated`
-- (inerte hasta ahora por falta de policy de UPDATE) — sin acotar a la
-- columna, la policy nueva habría dejado reescribir `tipo`/`titulo`/etc. de
-- cualquier conversación de mostrador visible.

alter table public.conversaciones add column mostrador_leido_hasta timestamptz;

revoke update on table public.conversaciones from authenticated;
grant update (mostrador_leido_hasta) on table public.conversaciones to authenticated;

create policy conversaciones_marca_leido_mostrador on public.conversaciones
  for update to authenticated
  using (tipo = 'ALUMNA_MOSTRADOR' and studio_id = public.current_studio_id() and public.puede_gestionar_calendario())
  with check (tipo = 'ALUMNA_MOSTRADOR' and studio_id = public.current_studio_id() and public.puede_gestionar_calendario());

comment on column public.conversaciones.mostrador_leido_hasta is
  'F-15 (auditoría 20ª pasada): marca de lectura COMPARTIDA para ALUMNA_MOSTRADOR — no hay fila STAFF individual (decisión ya cerrada), así que "leído" es del mostrador como conjunto. NULL = nunca abierto. Solo tiene sentido cuando tipo=ALUMNA_MOSTRADOR.';
