-- ═══════════════════════════════════════════════════════════════════
-- 0001 · restaurar_backup (P0-15)
-- ═══════════════════════════════════════════════════════════════════
-- El `db pull` del esquema real (0000_base) reveló que este RPC NUNCA se
-- aplicó al servidor, pese a que lib/backup-engine.ts:70 lo llama. Sin él,
-- restaurar un backup falla en runtime con "function restaurar_backup does
-- not exist". Primer uso real del flujo de migraciones versionadas: lo
-- traemos a producción como cambio revisado en Git, no pegado a mano.
--
-- Hace TODO (borrado en orden inverso de FK + reinserción en orden directo)
-- en UNA transacción plpgsql: si algo falla, se revierte entero y el tenant
-- nunca queda a medias.
-- ═══════════════════════════════════════════════════════════════════

create or replace function restaurar_backup(p_studio_id text, p_snapshot jsonb)
returns void language plpgsql security definer as $$
begin
  -- Borrado en orden INVERSO de dependencias (FK).
  delete from soporte_solicitudes where studio_id = p_studio_id;
  delete from dashboard_charts where studio_id = p_studio_id;
  delete from challenge_history where studio_id = p_studio_id;
  delete from challenge_progress where studio_id = p_studio_id;
  delete from challenge_definitions where studio_id = p_studio_id;
  delete from level_definitions where studio_id = p_studio_id;
  delete from achievement_history where studio_id = p_studio_id;
  delete from achievement_progress where studio_id = p_studio_id;
  delete from achievement_definitions where studio_id = p_studio_id;
  delete from reward_redemptions where studio_id = p_studio_id;
  delete from reward_catalog where studio_id = p_studio_id;
  delete from member_credits where studio_id = p_studio_id;
  delete from credit_transactions where studio_id = p_studio_id;
  delete from reward_history where studio_id = p_studio_id;
  delete from reward_actions where studio_id = p_studio_id;
  delete from reward_rules where studio_id = p_studio_id;
  delete from preferencias_socio where studio_id = p_studio_id;
  delete from integraciones where studio_id = p_studio_id;
  delete from notas_progreso where studio_id = p_studio_id;
  delete from notas_internas where studio_id = p_studio_id;
  delete from posts_comunidad where studio_id = p_studio_id;
  delete from videos_on_demand where studio_id = p_studio_id;
  delete from notificaciones where studio_id = p_studio_id;
  delete from mensajes_equipo where studio_id = p_studio_id;
  delete from actividad_reciente where studio_id = p_studio_id;
  delete from codigos_descuento where studio_id = p_studio_id;
  delete from automation_logs where studio_id = p_studio_id;
  delete from automation_rules where studio_id = p_studio_id;
  delete from automatizaciones where studio_id = p_studio_id;
  delete from campanas where studio_id = p_studio_id;
  delete from ventas_pos where studio_id = p_studio_id;
  delete from productos_pos where studio_id = p_studio_id;
  delete from citas where studio_id = p_studio_id;
  delete from facturas where studio_id = p_studio_id;
  delete from recibos where studio_id = p_studio_id;
  delete from reservas where studio_id = p_studio_id;
  delete from sesiones where studio_id = p_studio_id;
  delete from instructores where studio_id = p_studio_id;
  delete from tipos_clase where studio_id = p_studio_id;
  delete from spots where studio_id = p_studio_id;
  delete from salas where studio_id = p_studio_id;
  delete from suscripciones where studio_id = p_studio_id;
  delete from planes_tarifa where studio_id = p_studio_id;
  delete from socios where studio_id = p_studio_id;
  -- Reinserción en orden DIRECTO de dependencias.
  insert into socios select * from jsonb_populate_recordset(null::socios, coalesce(p_snapshot->'socios', '[]'::jsonb));
  insert into planes_tarifa select * from jsonb_populate_recordset(null::planes_tarifa, coalesce(p_snapshot->'planes_tarifa', '[]'::jsonb));
  insert into suscripciones select * from jsonb_populate_recordset(null::suscripciones, coalesce(p_snapshot->'suscripciones', '[]'::jsonb));
  insert into salas select * from jsonb_populate_recordset(null::salas, coalesce(p_snapshot->'salas', '[]'::jsonb));
  insert into spots select * from jsonb_populate_recordset(null::spots, coalesce(p_snapshot->'spots', '[]'::jsonb));
  insert into tipos_clase select * from jsonb_populate_recordset(null::tipos_clase, coalesce(p_snapshot->'tipos_clase', '[]'::jsonb));
  insert into instructores select * from jsonb_populate_recordset(null::instructores, coalesce(p_snapshot->'instructores', '[]'::jsonb));
  insert into sesiones select * from jsonb_populate_recordset(null::sesiones, coalesce(p_snapshot->'sesiones', '[]'::jsonb));
  insert into reservas select * from jsonb_populate_recordset(null::reservas, coalesce(p_snapshot->'reservas', '[]'::jsonb));
  insert into recibos select * from jsonb_populate_recordset(null::recibos, coalesce(p_snapshot->'recibos', '[]'::jsonb));
  insert into facturas select * from jsonb_populate_recordset(null::facturas, coalesce(p_snapshot->'facturas', '[]'::jsonb));
  insert into citas select * from jsonb_populate_recordset(null::citas, coalesce(p_snapshot->'citas', '[]'::jsonb));
  insert into productos_pos select * from jsonb_populate_recordset(null::productos_pos, coalesce(p_snapshot->'productos_pos', '[]'::jsonb));
  insert into ventas_pos select * from jsonb_populate_recordset(null::ventas_pos, coalesce(p_snapshot->'ventas_pos', '[]'::jsonb));
  insert into campanas select * from jsonb_populate_recordset(null::campanas, coalesce(p_snapshot->'campanas', '[]'::jsonb));
  insert into automatizaciones select * from jsonb_populate_recordset(null::automatizaciones, coalesce(p_snapshot->'automatizaciones', '[]'::jsonb));
  insert into automation_rules select * from jsonb_populate_recordset(null::automation_rules, coalesce(p_snapshot->'automation_rules', '[]'::jsonb));
  insert into automation_logs select * from jsonb_populate_recordset(null::automation_logs, coalesce(p_snapshot->'automation_logs', '[]'::jsonb));
  insert into codigos_descuento select * from jsonb_populate_recordset(null::codigos_descuento, coalesce(p_snapshot->'codigos_descuento', '[]'::jsonb));
  insert into actividad_reciente select * from jsonb_populate_recordset(null::actividad_reciente, coalesce(p_snapshot->'actividad_reciente', '[]'::jsonb));
  insert into mensajes_equipo select * from jsonb_populate_recordset(null::mensajes_equipo, coalesce(p_snapshot->'mensajes_equipo', '[]'::jsonb));
  insert into notificaciones select * from jsonb_populate_recordset(null::notificaciones, coalesce(p_snapshot->'notificaciones', '[]'::jsonb));
  insert into videos_on_demand select * from jsonb_populate_recordset(null::videos_on_demand, coalesce(p_snapshot->'videos_on_demand', '[]'::jsonb));
  insert into posts_comunidad select * from jsonb_populate_recordset(null::posts_comunidad, coalesce(p_snapshot->'posts_comunidad', '[]'::jsonb));
  insert into notas_internas select * from jsonb_populate_recordset(null::notas_internas, coalesce(p_snapshot->'notas_internas', '[]'::jsonb));
  insert into notas_progreso select * from jsonb_populate_recordset(null::notas_progreso, coalesce(p_snapshot->'notas_progreso', '[]'::jsonb));
  insert into integraciones select * from jsonb_populate_recordset(null::integraciones, coalesce(p_snapshot->'integraciones', '[]'::jsonb));
  insert into preferencias_socio select * from jsonb_populate_recordset(null::preferencias_socio, coalesce(p_snapshot->'preferencias_socio', '[]'::jsonb));
  insert into reward_rules select * from jsonb_populate_recordset(null::reward_rules, coalesce(p_snapshot->'reward_rules', '[]'::jsonb));
  insert into reward_actions select * from jsonb_populate_recordset(null::reward_actions, coalesce(p_snapshot->'reward_actions', '[]'::jsonb));
  insert into reward_history select * from jsonb_populate_recordset(null::reward_history, coalesce(p_snapshot->'reward_history', '[]'::jsonb));
  insert into credit_transactions select * from jsonb_populate_recordset(null::credit_transactions, coalesce(p_snapshot->'credit_transactions', '[]'::jsonb));
  insert into member_credits select * from jsonb_populate_recordset(null::member_credits, coalesce(p_snapshot->'member_credits', '[]'::jsonb));
  insert into reward_catalog select * from jsonb_populate_recordset(null::reward_catalog, coalesce(p_snapshot->'reward_catalog', '[]'::jsonb));
  insert into reward_redemptions select * from jsonb_populate_recordset(null::reward_redemptions, coalesce(p_snapshot->'reward_redemptions', '[]'::jsonb));
  insert into achievement_definitions select * from jsonb_populate_recordset(null::achievement_definitions, coalesce(p_snapshot->'achievement_definitions', '[]'::jsonb));
  insert into achievement_progress select * from jsonb_populate_recordset(null::achievement_progress, coalesce(p_snapshot->'achievement_progress', '[]'::jsonb));
  insert into achievement_history select * from jsonb_populate_recordset(null::achievement_history, coalesce(p_snapshot->'achievement_history', '[]'::jsonb));
  insert into level_definitions select * from jsonb_populate_recordset(null::level_definitions, coalesce(p_snapshot->'level_definitions', '[]'::jsonb));
  insert into challenge_definitions select * from jsonb_populate_recordset(null::challenge_definitions, coalesce(p_snapshot->'challenge_definitions', '[]'::jsonb));
  insert into challenge_progress select * from jsonb_populate_recordset(null::challenge_progress, coalesce(p_snapshot->'challenge_progress', '[]'::jsonb));
  insert into challenge_history select * from jsonb_populate_recordset(null::challenge_history, coalesce(p_snapshot->'challenge_history', '[]'::jsonb));
  insert into dashboard_charts select * from jsonb_populate_recordset(null::dashboard_charts, coalesce(p_snapshot->'dashboard_charts', '[]'::jsonb));
  insert into soporte_solicitudes select * from jsonb_populate_recordset(null::soporte_solicitudes, coalesce(p_snapshot->'soporte_solicitudes', '[]'::jsonb));
end;
$$;
grant execute on function restaurar_backup(text, jsonb) to service_role;
