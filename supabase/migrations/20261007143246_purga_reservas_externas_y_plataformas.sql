-- ═══════════════════════════════════════════════════════════════════════════
-- La purga de un estudio también vacía a quien reservó desde otra plataforma.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Desde el 1-oct una reserva puede venir de ClassPass, Urban Sports Club o
-- Wellhub (20261001115953): sin socia, con el nombre de la persona tal como lo
-- da la plataforma o lo apunta recepción (`nombre_externo`) y, si la plataforma
-- lo manda, su id allí (`id_cliente_externo`; en Wellhub, el Wellhub ID, que
-- identifica a la persona en todos sus gimnasios). La purga conserva `reservas`
-- y `anonimizar_socio` no la toca (no hay socia), así que ese nombre y ese id
-- sobrevivían para siempre. Ahora:
--   · nombre_externo     → 'Persona eliminada', solo donde lo hay. Null no
--     puede ser: el CHECK reservas_origen_coherente exige nombre en toda
--     externa, y un null tumbaría la purga entera.
--   · id_cliente_externo → null.
--   · id_reserva_externa se queda: es la referencia de la RESERVA en la
--     plataforma, no de la persona, y la usan sus webhooks y la conciliación de
--     Wellhub mientras se retira lo publicado.
--
-- Las tablas de las plataformas, por lo que hace cada una después de la purga.
-- Los crons de USC y de Wellhub siguen recorriendo un estudio apagado o sin
-- conexión para quitar lo que dejó publicado (lib/plataformas/usc/
-- horario-servidor.ts y su gemelo de Wellhub):
--   · plataforma_cupos       → se borra. Sin plazas cedidas, el cron de USC
--     cancela allí todo lo que siga vivo.
--   · plataforma_conexiones  → se borra. Sin conexión, el estudio deja de
--     publicar en Wellhub, el cron retira lo publicado con el gym de cada clase
--     (nunca con la conexión) y el webhook de check-in ya no lleva ese gym a
--     este estudio.
--   · plataforma_checkins    → se borra. Lleva el Wellhub ID mientras está
--     pendiente, y un estudio purgado ya no valida visitas.
--   · plataforma_eventos, plataforma_clases, plataforma_instructoras → se
--     CONSERVAN: son los ids con los que se cancela, oculta o renombra allí lo
--     publicado. Borrarlos dejaría en la app de la plataforma clases reservables
--     de un estudio que ya no existe, sin forma de saber cuáles eran (lo que ya
--     arregló 20261001140635 §3). No guardan a ninguna persona: ids de la
--     plataforma, el nombre y la descripción de la clase y el id de trainer de
--     la instructora, que ya se conservaba por lo mismo (renombrarTrainers).
--
-- Las dos de Wellhub las crea wellhub_por_api, aplicada en producción
-- (20261007133136) antes de que su fichero llegue al repo: van en una lista
-- aparte que se salta la tabla si no existe. El resto de c_borrar sigue fallando
-- si falta una tabla, a propósito.
--
-- Medido en producción el 7-oct: 0 reservas externas y 0 filas en las tablas de
-- plataforma. No cambia nada de lo que ya hay: cierra el hueco antes de que lo
-- haya.
-- ═══════════════════════════════════════════════════════════════════════════

-- Copia literal de la definición vigente (20261003102645) salvo lo de arriba. Si
-- otra sesión la ha cambiado entretanto, esto falla en vez de pisarla.
do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.purgar_estudio_vencido(text, boolean)'::regprocedure)
     <> '0b87cabbdda954ea880ea3fb455431a3' then
    raise exception 'purgar_estudio_vencido no es la de 20261003102645: rehaz esta copia sobre la vigente';
  end if;
end $$;

create or replace function public.purgar_estudio_vencido(p_studio_id text, p_ejecutar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- ⚠️ LEGAL: suelos de la guardia; el plazo real lo decide el ciclo en TS.
  c_dias_minimos constant interval := interval '90 days';
  c_dias_minimos_baja constant interval := interval '30 days';
  c_borrar constant text[] := array[
    'recomendacion_outcomes', 'recomendaciones', 'decision_snapshots', 'decision_mensajes_dia',
    'notification_delivery', 'notification', 'notification_preference', 'push_subscription',
    'automation_logs', 'actividad_reciente', 'widget_eventos', 'intentos_reserva_fallidos', 'avisos_hueco',
    'valoraciones_iniciales_salud', 'valoraciones_iniciales', 'condiciones_salud',
    'respuestas_cuestionario_salud', 'respuestas_sesion', 'notas_internas', 'notas_progreso',
    'documentos_socio', 'memoria_socio', 'comunicaciones_socio', 'preferencias_socio', 'tareas',
    'mensajes', 'conversaciones', 'mensajes_equipo',
    'comentarios_comunidad', 'post_likes', 'posts_comunidad',
    'valoraciones', 'favoritos_clase', 'socio_companeras', 'reto_participaciones',
    'achievement_history', 'achievement_progress', 'challenge_history', 'challenge_progress',
    'reward_history', 'reward_redemptions', 'reward_actions', 'credit_transactions', 'member_credits',
    'instructor_bajas_seguimiento', 'bajas_instructora', 'instructora_disponibilidad_excepciones',
    'instructora_ausencias', 'instructora_disponibilidad', 'citas_disponibilidad',
    'instructor_dependency_snapshots', 'sustitucion_contactos',
    'oauth_auditoria_accesos', 'oauth_codigos_autorizacion', 'oauth_tokens', 'oauth_consentimientos',
    'integracion_credenciales', 'migracion_batches', 'resumen_semanal_envios', 'soporte_solicitudes',
    'backups', 'consultas_contacto',
    'api_webhook_entregas', 'api_webhooks', 'api_eventos', 'api_claves', 'api_acceso_estudios',
    -- Sin plazas cedidas, el cron de USC cancela allí lo que siga publicado. Los
    -- ids con los que lo cancela, oculta o renombra (plataforma_eventos,
    -- plataforma_clases, plataforma_instructoras) se conservan a propósito.
    'plataforma_cupos'
  ];
  -- Las de Wellhub: su migración (wellhub_por_api) se aplicó en producción antes
  -- de tener su fichero en el repo, así que una base hecha desde el repo puede no
  -- tenerlas. Solo estas se saltan si no existen; en c_borrar, una tabla que
  -- falta tiene que seguir tumbando la purga.
  c_borrar_si_existe constant text[] := array['plataforma_conexiones', 'plataforma_checkins'];
  -- Texto libre en filas que se conservan: [tabla, columna, valor vacío en SQL].
  c_vaciar constant text[][] := array[
    ['sustituciones', 'motivo', 'null'],
    ['sustituciones', 'ranking', '''[]''::jsonb'],
    ['sustituciones', 'candidatos_network', 'null'],
    ['sesiones', 'notas', 'null'],
    ['sesiones', 'incidencia_texto', 'null'],
    ['citas', 'notas', 'null'],
    -- Jornadas y su auditoría se conservan (registro de jornada) sin quién las
    -- tocó ni por qué: la cuenta pasa a un centinela y el motivo, libre, se vacía.
    ['instructor_work_sessions', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['instructor_work_sessions', 'edited_by', 'null'],
    ['work_session_audits', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['work_session_audits', 'reason', 'null'],
    -- Igual con las clases impartidas: se conservan (qué clase se dio y cuándo)
    -- sin quién las tocó ni el motivo libre de las correcciones.
    ['clases_impartidas', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['clases_impartidas', 'edited_by', 'null'],
    ['clases_impartidas', 'revisada_por', 'null'],
    ['clases_impartidas_auditoria', 'created_by', '''00000000-0000-0000-0000-000000000000''::uuid'],
    ['clases_impartidas_auditoria', 'motivo', 'null'],
    -- Reservas de ClassPass, USC o Wellhub: no hay socia que anonimizar, la
    -- persona está en la propia fila. El nombre no puede quedar null: el CHECK
    -- reservas_origen_coherente lo exige en toda externa (y tumbaría la purga
    -- entera) y lo prohíbe en las de Tentare, de ahí el case. La referencia de la
    -- RESERVA (id_reserva_externa) se queda: no es la persona, y la usan los
    -- webhooks de la plataforma mientras se retira lo publicado.
    ['reservas', 'nombre_externo', 'case when nombre_externo is not null then ''Persona eliminada'' end'],
    ['reservas', 'id_cliente_externo', 'null']
  ];
  -- Los scopes del CHECK de instructor_enlaces_vigentes. Sin '.', nunca pasa por
  -- un token firmado: cualquier enlace de la instructora deja de reconocerse.
  c_scopes_enlace constant text[] := array['disponibilidad', 'reportar_baja', 'invitacion'];
  c_token_revocado constant text := 'revocado-por-purga';
  c_conservar constant text[] := array[
    'facturas', 'recibos', 'ventas_pos', 'devoluciones', 'pagos_historicos', 'mandatos_sepa',
    'penalizaciones', 'liquidaciones_instructoras', 'instructor_tarifas', 'lecturas_ficha_salud',
    'reservas', 'suscripciones', 'instructor_work_sessions', 'work_session_audits',
    'clases_impartidas', 'clases_impartidas_auditoria'
  ];
  v_estudio     record;
  v_tabla       text;
  v_col         text[];
  v_n           bigint;
  v_borrar      jsonb := '{}'::jsonb;
  v_conservar   jsonb := '{}'::jsonb;
  v_vaciar      jsonb := '{}'::jsonb;
  v_socio       record;
  v_n_socias    bigint;
  v_n_instr     bigint;
  v_anonimizar  boolean := to_regprocedure('public.anonimizar_socio(text,text,uuid,text)') is not null;
begin
  select s.id, s.subscription_status, s.subscription_id, s.trial_ends_at, s.contrato_terminado_en, s.cadena_id,
         s.supresion_pedida_en, c.subscription_status as estado_cadena
    into v_estudio
    from public.studios s left join public.cadenas c on c.id = s.cadena_id
   where s.id = p_studio_id;
  if not found then
    raise exception 'purgar_estudio_vencido: el estudio % no existe', p_studio_id;
  end if;

  -- Guardia EN LA BD, no solo en el cron: jamás se purga un estudio que paga.
  -- Dos casos y nada más: la prueba local vencida sin suscripción hace 90 días,
  -- o la baja de un estudio de pago hace 30 (o antes, si la propietaria lo pidió
  -- con el contrato ya terminado), con la suscripción QUE MANDA (la de la
  -- cadena, si es sede) terminada todavía hoy. `contrato_terminado_en` solo no
  -- basta: se mira también el estado, por si la fecha quedara desfasada.
  if not (
    coalesce(
      v_estudio.subscription_status = 'trial_expirado'
      and v_estudio.subscription_id is null
      and v_estudio.trial_ends_at <= now() - c_dias_minimos
      -- Una sede, además, nunca con su CADENA viva (lo propaga
      -- propagar_plan_cadena; aquí se vuelve a mirar por si se desfasara).
      and (v_estudio.cadena_id is null
           or coalesce(v_estudio.estado_cadena, '') not in ('active', 'trialing', 'past_due', 'unpaid')), false)
    or coalesce(
      v_estudio.contrato_terminado_en is not null
      and (v_estudio.contrato_terminado_en <= now() - c_dias_minimos_baja or v_estudio.supresion_pedida_en is not null)
      and (case when v_estudio.cadena_id is null then v_estudio.subscription_status else v_estudio.estado_cadena end)
          in ('canceled', 'incomplete_expired'), false)
  ) then
    raise exception 'purgar_estudio_vencido: % no lleva 90 días con la prueba vencida ni 30 de baja', p_studio_id;
  end if;

  select count(*) into v_n_socias from public.socios where studio_id = p_studio_id and borrado_en is null;
  select count(*) into v_n_instr from public.instructores
   where studio_id = p_studio_id
     and (email is not null or telefono is not null or auth_user_id is not null
          or foto_url is not null or avatar is not null or bio is not null);

  if p_ejecutar and v_n_socias > 0 and not v_anonimizar then
    raise exception 'purgar_estudio_vencido: falta public.anonimizar_socio(text, text, uuid, text); no se purga sin anonimizar a las socias';
  end if;

  if p_ejecutar then
    for v_socio in select id from public.socios where studio_id = p_studio_id and borrado_en is null loop
      perform public.anonimizar_socio(p_studio_id, v_socio.id);
    end loop;

    update public.instructores
       set nombre = 'Instructora eliminada', email = null, telefono = null, auth_user_id = null,
           foto_url = null, avatar = null, bio = null, activo = false
     where studio_id = p_studio_id;
  end if;

  foreach v_tabla in array c_borrar || c_borrar_si_existe loop
    continue when v_tabla = any(c_borrar_si_existe) and to_regclass(format('public.%I', v_tabla)) is null;
    if p_ejecutar then
      execute format('delete from public.%I where studio_id = $1', v_tabla) using p_studio_id;
      get diagnostics v_n = row_count;
    else
      execute format('select count(*) from public.%I where studio_id = $1', v_tabla) into v_n using p_studio_id;
    end if;
    v_borrar := v_borrar || jsonb_build_object(v_tabla, v_n);
  end loop;

  -- La fila se queda (la clase, la cita, quién cubrió a quién); el texto, no.
  foreach v_col slice 1 in array c_vaciar loop
    if p_ejecutar then
      execute format('update public.%I set %I = %s where studio_id = $1 and %I is distinct from %s',
                     v_col[1], v_col[2], v_col[3], v_col[2], v_col[3]) using p_studio_id;
      get diagnostics v_n = row_count;
    else
      execute format('select count(*) from public.%I where studio_id = $1 and %I is distinct from %s',
                     v_col[1], v_col[2], v_col[3]) into v_n using p_studio_id;
    end if;
    v_vaciar := v_vaciar || jsonb_build_object(v_col[1] || '.' || v_col[2], v_n);
  end loop;

  -- Enlaces de la instructora: centinela y no DELETE (ver cabecera de la migración).
  select count(*) into v_n from public.instructor_enlaces_vigentes
   where studio_id = p_studio_id and token <> c_token_revocado;
  if p_ejecutar then
    insert into public.instructor_enlaces_vigentes (instructor_id, studio_id, scope, token)
    select i.id, i.studio_id, s.scope, c_token_revocado
      from public.instructores i
     cross join unnest(c_scopes_enlace) as s(scope)
     where i.studio_id = p_studio_id
    on conflict (instructor_id, scope) do update
       set token = excluded.token, email_enviado_en = null, actualizado_en = now();
  end if;
  v_vaciar := v_vaciar || jsonb_build_object('instructor_enlaces_vigentes.token', v_n);

  foreach v_tabla in array c_conservar loop
    execute format('select count(*) from public.%I where studio_id = $1', v_tabla) into v_n using p_studio_id;
    v_conservar := v_conservar || jsonb_build_object(v_tabla, v_n);
  end loop;

  return jsonb_build_object(
    'modo', case when p_ejecutar then 'activa' else 'informe' end,
    'socios_a_anonimizar', v_n_socias,
    'instructoras_a_anonimizar', v_n_instr,
    'anonimizar_socio_disponible', v_anonimizar,
    'borrar', v_borrar,
    'vaciar', v_vaciar,
    'conservar', v_conservar
  );
end;
$$;

revoke execute on function public.purgar_estudio_vencido(text, boolean) from public;
revoke execute on function public.purgar_estudio_vencido(text, boolean) from anon;
revoke execute on function public.purgar_estudio_vencido(text, boolean) from authenticated;
grant  execute on function public.purgar_estudio_vencido(text, boolean) to service_role;

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.purgar_estudio_vencido(text, boolean)'::regprocedure);
  v_rol text;
begin
  foreach v_rol in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_rol, 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE') then
      raise exception '% puede ejecutar purgar_estudio_vencido', v_rol;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar purgar_estudio_vencido';
  end if;
  if position('''plataforma_cupos''' in v_def) = 0 or position('''id_cliente_externo''' in v_def) = 0
     or position('c_borrar_si_existe' in v_def) = 0 then
    raise exception 'purgar_estudio_vencido no es la versión de esta migración';
  end if;
end $$;
