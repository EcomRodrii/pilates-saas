-- ═══════════════════════════════════════════════════════════════════════════
-- Purga diaria de datos técnicos caducados.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hasta hoy no había NINGUNA purga por antigüedad: ni en pg_cron, ni en
-- Inngest, ni en los crons de Vercel. Las de `rate_limits` y `webhook_events`
-- se quedaron escritas como comentario en 0031/0032 («follow-up, no
-- bloqueante») y nunca se implementaron. Medido en prod el 2026-09-13:
-- `rate_limits` 795 filas, 743 caducadas hace más de un día;
-- `cron.job_run_details` 31.576 filas, 16.441 de más de 14 días.
--
-- ── TABLA DE PLAZOS ─────────────────────────────────────────────────────────
-- ⚠️ LEGAL: todos los plazos son una propuesta técnica PENDIENTE DE VALIDAR por
-- el abogado antes de comunicarlos en el RAT, la política de privacidad o el
-- contrato de encargo. Cambiar uno = nueva migración con `create or replace`.
--
--   tabla                       criterio                                   plazo
--   ─────────────────────────   ────────────────────────────────────────   ─────────
--   rate_limits                 ventana ya cerrada (reset_at)              > 1 día
--   webhook_events              estado = 'completado' (recibido_en)        > 30 días
--                               (Stripe no reintenta pasados ~3 días; los
--                               'procesando' atascados NO se tocan: son
--                               una señal de fallo que alguien debe ver)
--   notification_delivery       created_at                                 > 12 meses
--   notification                leída o archivada (created_at)             > 12 meses
--                               sin leer ni archivar (tope)                > 24 meses
--   widget_eventos              creado_en                                  > 13 meses
--   intentos_reserva_fallidos   creado_en                                  > 13 meses
--   automation_logs             ejecutado_en, sin paso futuro pendiente    > 24 meses
--   actividad_reciente          creado_en                                  > 24 meses
--   email_rebotes               detectado_en, email SIN socia, instructora
--                               ni propietaria (studios.email o su cuenta) > 12 meses
--   cron.job_run_details        coalesce(end_time, start_time)             > 14 días
--
-- 13 meses (y no 12) en las dos de analítica: deja comparar un mes con el
-- mismo mes del año anterior.
--
-- ── FUERA A PROPÓSITO (plazo legal pendiente, no tocar sin validación) ──────
--   · Fiscal: facturas, recibos, ventas_pos, devoluciones, pagos_historicos,
--     mandatos_sepa, penalizaciones, liquidaciones_instructoras.
--   · Salud: condiciones_salud, respuestas_cuestionario_salud,
--     valoraciones_iniciales*, notas_progreso, lecturas_ficha_salud.
--   · plataforma_auditoria y oauth_auditoria_accesos (registro de seguridad).
--   · recomendaciones, mensajes, posts de comunidad: sin plazo decidido.
--   · Backups en R2: su retención por fecha vive en código
--     (lib/engines/backup-engine.ts, RETENCION_MANUAL_DIAS).
--
-- ── PRIVILEGIOS ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER con dueño `postgres`: `postgres` tiene DELETE sobre
-- `cron.job_run_details` (el dueño es supabase_admin, pero el privilegio está
-- concedido; verificado con has_table_privilege el 2026-09-13) y BYPASSRLS, así
-- que la función alcanza las tablas con RLS sin políticas. Ninguna tabla purgada
-- tiene triggers ON DELETE (verificado en pg_trigger), y la única FK entrante es
-- notification_delivery → notification (CASCADE): por eso se borra antes la hija.
-- Solo service_role/postgres pueden ejecutarla: los tres pasos explícitos, porque
-- en este proyecto pg_default_acl da EXECUTE directo a anon/authenticated
-- (tentare-os.md §Seguridad, caso `reservar_numero_factura`).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.purgar_datos_caducados()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- ⚠️ LEGAL: plazos pendientes de validación (ver tabla de la cabecera).
  c_rate_limits           constant interval := interval '1 day';
  c_webhook_events        constant interval := interval '30 days';
  c_notificaciones        constant interval := interval '12 months';
  c_notificaciones_tope   constant interval := interval '24 months';
  c_analitica             constant interval := interval '13 months';
  c_logs_actividad        constant interval := interval '24 months';
  c_rebotes_sin_ficha     constant interval := interval '12 months';
  c_cron_historial        constant interval := interval '14 days';

  v_n       bigint;
  v_resumen jsonb := '{}'::jsonb;
begin
  delete from public.rate_limits where reset_at < now() - c_rate_limits;
  get diagnostics v_n = row_count;
  v_resumen := v_resumen || jsonb_build_object('rate_limits', v_n);

  delete from public.webhook_events
   where estado = 'completado' and recibido_en < now() - c_webhook_events;
  get diagnostics v_n = row_count;
  v_resumen := v_resumen || jsonb_build_object('webhook_events', v_n);

  -- La hija primero: si no, el CASCADE de la madre se llevaría entregas más
  -- recientes que el plazo propio de notification_delivery.
  delete from public.notification_delivery where created_at < now() - c_notificaciones;
  get diagnostics v_n = row_count;
  v_resumen := v_resumen || jsonb_build_object('notification_delivery', v_n);

  delete from public.notification
   where (created_at < now() - c_notificaciones and (read_at is not null or archived_at is not null))
      or created_at < now() - c_notificaciones_tope;
  get diagnostics v_n = row_count;
  v_resumen := v_resumen || jsonb_build_object('notification', v_n);

  delete from public.widget_eventos where creado_en < now() - c_analitica;
  get diagnostics v_n = row_count;
  v_resumen := v_resumen || jsonb_build_object('widget_eventos', v_n);

  delete from public.intentos_reserva_fallidos where creado_en < now() - c_analitica;
  get diagnostics v_n = row_count;
  v_resumen := v_resumen || jsonb_build_object('intentos_reserva_fallidos', v_n);

  -- Un log con un paso programado en el futuro sigue siendo estado vivo del
  -- motor de automatizaciones, no historial: no se toca por viejo que sea.
  delete from public.automation_logs
   where ejecutado_en < now() - c_logs_actividad
     and (proxima_accion_en is null or proxima_accion_en < now());
  get diagnostics v_n = row_count;
  v_resumen := v_resumen || jsonb_build_object('automation_logs', v_n);

  delete from public.actividad_reciente where creado_en < now() - c_logs_actividad;
  get diagnostics v_n = row_count;
  v_resumen := v_resumen || jsonb_build_object('actividad_reciente', v_n);

  -- Un rebote de un email que sigue en uso NO es historial: es lo que impide
  -- volver a escribir a un buzón muerto. Solo se purgan los que ya no son de
  -- nadie a quien Tentare escriba (socia, instructora o propietaria).
  delete from public.email_rebotes e
   where e.detectado_en < now() - c_rebotes_sin_ficha
     and not exists (select 1 from public.socios s where lower(s.email) = lower(e.email))
     and not exists (select 1 from public.instructores i where lower(i.email) = lower(e.email))
     and not exists (select 1 from public.studios st where lower(st.email) = lower(e.email))
     and not exists (
       select 1 from public.studios st
       join auth.users u on u.id = st.owner_auth_user_id
       where lower(u.email) = lower(e.email)
     );
  get diagnostics v_n = row_count;
  v_resumen := v_resumen || jsonb_build_object('email_rebotes', v_n);

  -- Historial de ejecuciones de pg_cron: operación pura, sin PII. `end_time`
  -- queda NULL en una ejecución que murió a medias; sin el coalesce esas filas
  -- no caducarían nunca.
  delete from cron.job_run_details
   where coalesce(end_time, start_time) < now() - c_cron_historial;
  get diagnostics v_n = row_count;
  v_resumen := v_resumen || jsonb_build_object('cron.job_run_details', v_n);

  raise log 'purgar_datos_caducados: %', v_resumen;
  return v_resumen;
end;
$$;

comment on function public.purgar_datos_caducados() is
  'Purga diaria por antigüedad de datos técnicos (plazos en la cabecera de la migración 20260913172000, pendientes de validación legal). Devuelve el recuento borrado por tabla. Solo service_role/postgres.';

revoke execute on function public.purgar_datos_caducados() from public;
revoke execute on function public.purgar_datos_caducados() from anon;
revoke execute on function public.purgar_datos_caducados() from authenticated;
grant  execute on function public.purgar_datos_caducados() to service_role;
grant  execute on function public.purgar_datos_caducados() to postgres;

do $$
begin
  if has_function_privilege('anon', 'public.purgar_datos_caducados()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.purgar_datos_caducados()', 'EXECUTE') then
    raise exception 'purgar_datos_caducados sigue siendo ejecutable por anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.purgar_datos_caducados()', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar purgar_datos_caducados';
  end if;
end $$;

-- Diario a las 04:30 UTC: después de `backups-diarios` (03:00) y lejos de las
-- horas de uso. SQL directo, sin pasar por HTTP: no hay nada que hacer fuera de
-- la BD (mismo patrón que `cerrar-pruebas-vencidas`).
select cron.unschedule('purgar-datos-caducados')
where exists (select 1 from cron.job where jobname = 'purgar-datos-caducados');

select cron.schedule(
  'purgar-datos-caducados',
  '30 4 * * *',
  $$select public.purgar_datos_caducados();$$
);
