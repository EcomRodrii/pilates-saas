-- La purga de un estudio vencido limpia lo que quedaba de sus instructoras fuera
-- de las tablas que ya borraba.
--
-- `purgar_estudio_vencido` anonimiza `instructores` con UPDATE: ningún cascade de
-- sus tablas hijas actúa y sobrevive todo lo que la función no toca a mano.
-- Cruzadas las FKs a `instructores` (pg_constraint, prod 2026-09-14) contra
-- c_borrar y c_conservar, quedaban sin decidir:
--
--   BORRAR — sin la persona no sirven para nada y no son fiscales
--   · instructora_disponibilidad, instructora_disponibilidad_excepciones,
--     citas_disponibilidad → el horario de una persona concreta. Las excepciones
--     van ANTES que instructora_ausencias: las ligadas a una ausencia caerían por
--     cascade y el informe contaría menos filas de las que borra de verdad.
--
--   VACIAR — la fila se conserva; el texto, no (c_vaciar)
--   · sesiones.notas, sesiones.incidencia_texto → texto libre del panel sobre la
--     clase; puede nombrar a quien la dio o a quien vino.
--   · citas.notas → anonimizar_socio solo vacía las citas de socias vivas: una
--     cita sin socia, o de una ya dada de baja, conservaba la nota.
--   · sustituciones.ranking → guarda una copia del NOMBRE de cada candidata y sus
--     motivos: el nombre sobrevivía a la anonimización. Queda '[]' (NOT NULL).
--   · sustituciones.candidatos_network → perfiles de Network, de terceros. NULL =
--     «no se buscó», que es lo que ya entiende estado-estudio.
--   · instructor_enlaces_vigentes.token → NO se borra la fila: sin fila, un enlace
--     firmado y sin caducar no se considera revocado (enlaceRevocado). Se escribe
--     un centinela en TODOS los scopes para cada instructora del estudio, y así
--     queda revocado cualquier enlace suyo, se hubiera guardado o no.
--
--   CONSERVAR
--   · sesiones.cancelada_motivo → código de sistema ('minimo_no_alcanzado' |
--     'cierre_centro'); solo lo escribe el servidor.
--   · contenido_portal_banners, novedades_estudio → contenido del estudio para sus
--     socias; created_by solo apunta a la instructora, ya anonimizada.
--   · videos_on_demand → el vídeo sí muestra a una persona, pero el asset vive en
--     Cloudflare Stream y nadie lo borra: borrar la fila antes que el asset lo
--     dejaría huérfano (mismo orden que Storage/R2 en
--     lib/retencion/avanzar-ciclo-estudios-vencidos.ts). Queda pendiente junto al
--     borrado del asset; VOD está congelado y hoy no hay vídeos en estudios vencidos.
--
-- El resto del cuerpo es el vivo en producción tras 20260914194500: el primer
-- bloque se niega a seguir si pg_get_functiondef ya no es esa definición. Misma
-- firma `(text, boolean)`; se repiten REVOKE/GRANT y se comprueban.
--
-- Guardia de contrato: lib/retencion/purga-estudio-motivos-contrato.test.ts.

do $$
begin
  if md5(pg_get_functiondef('public.purgar_estudio_vencido(text, boolean)'::regprocedure))
     is distinct from '8a23734e5e74a3dfb15c2f6d2a599607' then
    raise exception 'purgar_estudio_vencido ya no es la de 20260914194500: rehaz esta migración sobre la definición viva';
  end if;
end $$;

create or replace function public.purgar_estudio_vencido(p_studio_id text, p_ejecutar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- ⚠️ LEGAL: suelo de la guardia; el plazo real lo decide el ciclo en TS.
  c_dias_minimos constant interval := interval '90 days';
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
    'backups'
  ];
  -- Texto libre en filas que se conservan: [tabla, columna, valor vacío en SQL].
  c_vaciar constant text[][] := array[
    ['sustituciones', 'motivo', 'null'],
    ['sustituciones', 'ranking', '''[]''::jsonb'],
    ['sustituciones', 'candidatos_network', 'null'],
    ['sesiones', 'notas', 'null'],
    ['sesiones', 'incidencia_texto', 'null'],
    ['citas', 'notas', 'null']
  ];
  -- Los scopes del CHECK de instructor_enlaces_vigentes. Sin '.', nunca pasa por
  -- un token firmado: cualquier enlace de la instructora deja de reconocerse.
  c_scopes_enlace constant text[] := array['disponibilidad', 'reportar_baja', 'invitacion'];
  c_token_revocado constant text := 'revocado-por-purga';
  c_conservar constant text[] := array[
    'facturas', 'recibos', 'ventas_pos', 'devoluciones', 'pagos_historicos', 'mandatos_sepa',
    'penalizaciones', 'liquidaciones_instructoras', 'instructor_tarifas', 'lecturas_ficha_salud',
    'reservas', 'suscripciones'
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
  select id, subscription_status, subscription_id, trial_ends_at
    into v_estudio from public.studios where id = p_studio_id;
  if not found then
    raise exception 'purgar_estudio_vencido: el estudio % no existe', p_studio_id;
  end if;

  -- Guardia EN LA BD, no solo en el cron: jamás se purga un estudio que paga,
  -- que tiene suscripción de Stripe o que no lleva 90 días vencido.
  if v_estudio.subscription_status is distinct from 'trial_expirado'
     or v_estudio.subscription_id is not null
     or v_estudio.trial_ends_at is null
     or v_estudio.trial_ends_at > now() - c_dias_minimos then
    raise exception 'purgar_estudio_vencido: % no está en trial_expirado sin suscripción con más de 90 días', p_studio_id;
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

  foreach v_tabla in array c_borrar loop
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

comment on function public.purgar_estudio_vencido(text, boolean) is
  'Borra/anonimiza los datos personales de un estudio en trial_expirado >90 días (p_ejecutar=false: solo recuentos). Nunca borra studios ni datos fiscales. Solo service_role.';

revoke execute on function public.purgar_estudio_vencido(text, boolean) from public;
revoke execute on function public.purgar_estudio_vencido(text, boolean) from anon;
revoke execute on function public.purgar_estudio_vencido(text, boolean) from authenticated;
grant  execute on function public.purgar_estudio_vencido(text, boolean) to service_role;

do $$
declare
  v_def    text := pg_get_functiondef('public.purgar_estudio_vencido(text, boolean)'::regprocedure);
  -- Cuelgan de instructores y la purga no las toca a propósito (ver cabecera).
  v_fuera  text[] := array['contenido_portal_banners', 'novedades_estudio', 'videos_on_demand', 'red_formalizaciones'];
  v_tabla  text;
  v_scope  text;
begin
  if has_function_privilege('anon', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE') then
    raise exception 'purgar_estudio_vencido sigue siendo ejecutable por anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar purgar_estudio_vencido';
  end if;

  -- Toda tabla con FK a instructores aparece en la función o está fuera a propósito.
  for v_tabla in
    select distinct c.conrelid::regclass::text from pg_constraint c
     where c.contype = 'f' and c.confrelid = 'public.instructores'::regclass
  loop
    if not (v_def ~ ('\m' || v_tabla || '\M')) and not (v_tabla = any (v_fuera)) then
      raise exception 'purgar_estudio_vencido no decide qué hacer con %, que cuelga de instructores', v_tabla;
    end if;
  end loop;

  -- Todo scope que admite instructor_enlaces_vigentes recibe el centinela.
  for v_scope in
    select m[1] from pg_constraint c,
           regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') as m
     where c.conname = 'instructor_enlaces_vigentes_scope_check'
  loop
    if position(quote_literal(v_scope) in v_def) = 0 then
      raise exception 'purgar_estudio_vencido no revoca los enlaces con scope %', v_scope;
    end if;
  end loop;

  if position('''bajas_instructora''' in v_def) = 0
     or position('''instructora_ausencias''' in v_def) = 0
     or position('[''sustituciones'', ''motivo'', ''null'']' in v_def) = 0
     or position('[''sustituciones'', ''ranking''' in v_def) = 0
     or position('[''citas'', ''notas'', ''null'']' in v_def) = 0
     or position('on conflict (instructor_id, scope) do update' in v_def) = 0 then
    raise exception 'purgar_estudio_vencido perdió parte de la limpieza de bajas, sustituciones, citas o enlaces';
  end if;
end $$;
