-- Widget «Formulario de contacto» (lib/widgets/catalogo.ts): las consultas que
-- llegan desde la web del estudio.
--
-- Son de personas que aún NO son clientas, y por eso van en su propia tabla y
-- nunca en `socios`: una ficha ocupa plaza del plan (`contarSociasActivas` no
-- mira `lead_stage`) y el alta manda el correo de bienvenida del portal. Pasar
-- a clienta es una acción deliberada del mostrador, desde Clientas.
--
-- Solo escribe el endpoint público con service-role (app/api/public/contacto):
-- ninguna política de INSERT. Leen, cierran y borran quienes gestionan clientas
-- (PROPIETARIO, MANAGER, RECEPCION), el mismo trío que las solicitudes RGPD;
-- INSTRUCTOR fuera.

create table if not exists public.consultas_contacto (
  id text primary key default gen_random_uuid()::text,
  studio_id text not null references public.studios(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  email text not null check (length(email) between 3 and 200),
  telefono text check (telefono is null or length(telefono) <= 30),
  mensaje text not null check (length(btrim(mensaje)) between 1 and 2000),
  -- La etiqueta ?ref= del widget; el formato lo valida el endpoint.
  origen text check (origen is null or length(origen) <= 40),
  privacidad_aceptada_en timestamptz not null,
  estado text not null default 'nueva' check (estado in ('nueva', 'atendida')),
  creada_en timestamptz not null default now(),
  atendida_en timestamptz,
  -- Sin FK a auth.users (mismo motivo que solicitudes_derechos.resuelta_por).
  atendida_por uuid
);

-- (Restricciones de varias columnas aparte: el generador de db-types lee cada
-- línea del CREATE como una columna.)
alter table public.consultas_contacto
  add constraint consultas_contacto_cierre_coherente check (
    (estado = 'nueva' and atendida_en is null and atendida_por is null)
    or (estado = 'atendida' and atendida_en is not null)
  );

create index if not exists consultas_contacto_studio_estado
  on public.consultas_contacto (studio_id, estado, creada_en desc);

alter table public.consultas_contacto enable row level security;

drop policy if exists consultas_contacto_lectura on public.consultas_contacto;
create policy consultas_contacto_lectura on public.consultas_contacto
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()));

-- Solo nueva → atendida, firmada por quien la cierra. No se reabre.
drop policy if exists consultas_contacto_atender on public.consultas_contacto;
create policy consultas_contacto_atender on public.consultas_contacto
  for update to authenticated
  using (estado = 'nueva'
         and studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()))
  with check (estado = 'atendida' and atendida_por = (select auth.uid())
              and studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()));

-- Borrar: spam, y la supresión que pida la propia visitante.
drop policy if exists consultas_contacto_borrar on public.consultas_contacto;
create policy consultas_contacto_borrar on public.consultas_contacto
  for delete to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()));

-- pg_default_acl da todo a anon/authenticated en cada tabla nueva: se revoca y
-- se concede solo lo que usa el panel.
revoke all on table public.consultas_contacto from public, anon, authenticated;
grant select, delete on table public.consultas_contacto to authenticated;
grant update (estado, atendida_en, atendida_por) on table public.consultas_contacto to authenticated;
grant all on table public.consultas_contacto to service_role;

do $$
begin
  if has_table_privilege('anon', 'public.consultas_contacto', 'SELECT')
     or has_table_privilege('anon', 'public.consultas_contacto', 'INSERT')
     or has_table_privilege('authenticated', 'public.consultas_contacto', 'INSERT')
     or has_column_privilege('authenticated', 'public.consultas_contacto', 'mensaje', 'UPDATE')
     or has_column_privilege('authenticated', 'public.consultas_contacto', 'studio_id', 'UPDATE') then
    raise exception 'consultas_contacto: grants más abiertos de lo previsto';
  end if;
  if not has_table_privilege('authenticated', 'public.consultas_contacto', 'SELECT') then
    raise exception 'consultas_contacto: el panel no podría leerlas';
  end if;
end $$;

-- ⚠️ LEGAL: plazos pendientes de validar (mismo criterio que purgar_datos_caducados).
-- Atendida: 90 días. Cualquiera: 180 como tope, que es lo que promete el
-- formulario («como máximo 6 meses», lib/contacto/consulta.ts). SQL directo por
-- pg_cron, sin HTTP ni Inngest.
select cron.unschedule('purgar-consultas-contacto')
where exists (select 1 from cron.job where jobname = 'purgar-consultas-contacto');
select cron.schedule(
  'purgar-consultas-contacto',
  '45 4 * * *',
  $$delete from public.consultas_contacto
     where (estado = 'atendida' and atendida_en < now() - interval '90 days')
        or creada_en < now() - interval '180 days'$$
);

-- La purga de un estudio vencido no borra la fila de `studios`, así que el
-- cascade no actúa: las consultas van en c_borrar. El resto de la función es la
-- definición vigente (20260921210117), sin tocar — comprobado contra la de
-- producción (mismo md5 de prosrc) antes de escribir esto.
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
    'backups', 'consultas_contacto'
  ];
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
    ['clases_impartidas_auditoria', 'motivo', 'null']
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
     or position('on conflict (instructor_id, scope) do update' in v_def) = 0
     or position('[''work_session_audits'', ''reason'', ''null'']' in v_def) = 0
     or position('[''instructor_work_sessions'', ''created_by''' in v_def) = 0
     or position('[''clases_impartidas_auditoria'', ''motivo'', ''null'']' in v_def) = 0
     or position('''consultas_contacto''' in v_def) = 0 then
    raise exception 'purgar_estudio_vencido perdió parte de la limpieza de bajas, sustituciones, citas, enlaces o consultas';
  end if;
end $$;
