-- ════════════════════════════════════════════════════════════════════════════
-- Auditoría: el libro se conserva 6 años y después se borra solo
-- ════════════════════════════════════════════════════════════════════════════
--
-- Decisión del fundador (25-sep-2026): 6 AÑOS, el plazo mercantil de libros y
-- justificantes, coherente con los recibos y facturas que el libro audita.
--
-- Hasta hoy el libro no tenía plazo: se guardaba para siempre, y como es
-- inmutable ni siquiera se PODÍA borrar. El RGPD exige limitar la conservación de
-- los datos personales (aquí, el identificador de la cuenta de quien hizo cada
-- cambio y su rol), y una política que solo existe en un documento no se cumple.
--
-- ── Cómo se borra algo de un libro inmutable ───────────────────────────────
-- El trigger de inmutabilidad (`auditoria_estudio_inmutable`) rechazaba TODO
-- UPDATE, DELETE y TRUNCATE. Ahora deja pasar UN caso, y solo uno:
--
--   · es un DELETE (nunca UPDATE ni TRUNCATE), Y
--   · la transacción lo ha declarado (`tentare.purga_auditoria = 'on'`, que solo
--     fija `purgar_datos_caducados()` y con `set_config(..., true)`: local a la
--     transacción, se deshace sola), Y
--   · la fila tiene MÁS de 6 años.
--
-- Las tres a la vez. Aunque alguien llegara a fijar la variable, una entrada
-- reciente sigue sin poder borrarse, y ni el rol `authenticated` ni `anon` ni
-- `service_role` tienen privilegio DELETE sobre la tabla (el privilegio se
-- comprueba ANTES que el trigger): la única puerta es la función SECURITY DEFINER
-- de la purga diaria (pg_cron, 04:30), que es del dueño de la tabla.
--
-- Las comprobaciones van ANIDADAS y no con `and`: Postgres no garantiza el orden
-- de evaluación de un `and`, y en el trigger de TRUNCATE (por sentencia) `old` no
-- existe — referirlo es un error.
--
-- ── La purga ───────────────────────────────────────────────────────────────
-- Se añade a `purgar_datos_caducados()` (que ya borra a diario lo demás con su
-- tabla de plazos). Va en su PROPIO bloque con `exception`: un fallo al purgar el
-- libro no puede tumbar la purga de las otras nueve tablas — se deja en el
-- resumen (`auditoria_estudio_error`) para que se vea, no en silencio. Si el
-- bloque falla, el subtransaction rollback también deshace la variable.
--
-- ── TABLA DE PLAZOS (ampliación de la de 20260913220917) ───────────────────
--   auditoria_estudio     ocurrido_en                                    > 6 años
--
-- Mismo criterio de siempre: cambiar el plazo = nueva migración con `create or
-- replace` de las dos funciones, y el mismo número en lib/auditoria/aviso-equipo.ts
-- (un test los ata).
--
-- ⚠️ LEGAL: 6 años es la propuesta técnica que eligió el fundador; el abogado la
-- valida antes de comunicarla en la política de privacidad.
--
-- Sin cambios de firma: `create or replace` conserva los grants existentes
-- (service_role sí, anon y authenticated no). Aun así se DECIDEN por escrito al
-- final de este fichero —lo exige la guardia de migraciones con SECURITY DEFINER—
-- y se comprueba con has_function_privilege, no con el comentario.

create or replace function public.auditoria_estudio_inmutable()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('tentare.purga_auditoria', true), '') = 'on' then
      if old.ocurrido_en < now() - interval '6 years' then
        return old;
      end if;
    end if;
  end if;
  raise exception 'auditoria_estudio es inmutable: % no está permitido', tg_op;
end;
$function$;

create or replace function public.purgar_datos_caducados()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  -- ⚠️ LEGAL: plazos pendientes de validación (ver tabla de la cabecera de 20260913220917 y la ampliación de este fichero).
  c_rate_limits           constant interval := interval '1 day';
  c_webhook_events        constant interval := interval '30 days';
  c_notificaciones        constant interval := interval '12 months';
  c_notificaciones_tope   constant interval := interval '24 months';
  c_analitica             constant interval := interval '13 months';
  c_logs_actividad        constant interval := interval '24 months';
  c_rebotes_sin_ficha     constant interval := interval '12 months';
  c_cron_historial        constant interval := interval '14 days';
  c_auditoria             constant interval := interval '6 years';

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

  -- El libro de auditoría, a los 6 años. Bloque propio: si falla, no tumba lo demás
  -- y el fallo queda a la vista en el resumen. La variable es local a la transacción
  -- y se deshace también si el bloque aborta.
  begin
    perform set_config('tentare.purga_auditoria', 'on', true);
    delete from public.auditoria_estudio where ocurrido_en < now() - c_auditoria;
    get diagnostics v_n = row_count;
    perform set_config('tentare.purga_auditoria', '', true);
    v_resumen := v_resumen || jsonb_build_object('auditoria_estudio', v_n);
  exception when others then
    raise warning 'purgar_datos_caducados: no se pudo purgar auditoria_estudio: %', sqlerrm;
    v_resumen := v_resumen || jsonb_build_object('auditoria_estudio_error', sqlerrm);
  end;

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
$function$;

comment on function public.purgar_datos_caducados() is
  'Purga diaria por antigüedad de datos técnicos y del libro de auditoría (plazos en la cabecera de las migraciones 20260913220917 y 20260925215204; el libro, 6 años; todos pendientes de validación legal). Devuelve el recuento borrado por tabla, y auditoria_estudio_error si el libro no se pudo purgar. Solo service_role/postgres.';

-- Solo servicio: los tres pasos explícitos (pg_default_acl da EXECUTE directo a
-- anon/authenticated en este proyecto; revocar solo PUBLIC no basta).
revoke all on function public.purgar_datos_caducados() from public, anon, authenticated;
grant execute on function public.purgar_datos_caducados() to service_role;

-- ── Comprobación al aplicar (no fiarse del comentario SQL) ─────────────────
do $$
declare
  v_rol text;
begin
  -- La purga sigue siendo cosa de servicio: mismos grants que antes.
  foreach v_rol in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_rol, 'public.purgar_datos_caducados()', 'EXECUTE') then
      raise exception '% puede ejecutar purgar_datos_caducados', v_rol;
    end if;
    -- Y ninguno de los dos puede borrar del libro (el trigger no es la primera barrera).
    if has_table_privilege(v_rol, 'public.auditoria_estudio', 'DELETE')
       or has_table_privilege(v_rol, 'public.auditoria_estudio', 'UPDATE')
       or has_table_privilege(v_rol, 'public.auditoria_estudio', 'TRUNCATE')
       or has_any_column_privilege(v_rol, 'public.auditoria_estudio', 'UPDATE') then
      raise exception '% puede modificar auditoria_estudio', v_rol;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.purgar_datos_caducados()', 'EXECUTE') then
    raise exception 'service_role ya no puede ejecutar purgar_datos_caducados';
  end if;
  if has_table_privilege('service_role', 'public.auditoria_estudio', 'DELETE')
     or has_table_privilege('service_role', 'public.auditoria_estudio', 'UPDATE')
     or has_table_privilege('service_role', 'public.auditoria_estudio', 'TRUNCATE')
     or has_any_column_privilege('service_role', 'public.auditoria_estudio', 'UPDATE') then
    raise exception 'service_role puede modificar auditoria_estudio';
  end if;
  -- Los dos triggers de inmutabilidad siguen enganchados a la función (que ahora deja UN caso).
  if (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
       where t.tgrelid = 'public.auditoria_estudio'::regclass and not t.tgisinternal
         and p.proname = 'auditoria_estudio_inmutable') < 2 then
    raise exception 'auditoria_estudio ha perdido sus triggers de inmutabilidad';
  end if;
end;
$$;
