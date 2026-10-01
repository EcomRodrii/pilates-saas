-- ─────────────────────────────────────────────────────────────────────────────
-- F1 · API pública v1: claves de API por estudio.
--
-- Hasta ahora la única puerta de entrada de terceros era OAuth (Zapier, un
-- catálogo cerrado de apps). Un programa de contabilidad, o el script de una
-- gestoría, necesita una credencial servidor a servidor: una clave del estudio,
-- con scopes, revocable y con último uso. Abre la MISMA API que los tokens
-- OAuth (/api/v1): mismo catálogo de scopes, mismo rate limit, misma auditoría.
-- Diseño en docs/api-publica.md.
--
-- Las tres tablas son de SERVIDOR: RLS activada sin ninguna política y sin
-- grants para anon/authenticated (mismo patrón que oauth_tokens e
-- integracion_credenciales). El panel las gestiona por /api/integrations/api-publica,
-- que exige sesión de PROPIETARIO.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── La API se activa estudio a estudio ───────────────────────────────────────
-- Decisión del fundador (1-oct-2026): la API no queda abierta a todos los
-- planes, pero tampoco se inventan límites comerciales todavía. La activa
-- Tentare desde /interno; sin fila aquí, el estudio no puede crear claves.
create table if not exists public.api_acceso_estudios (
  studio_id      text primary key references public.studios(id) on delete cascade,
  activada_en    timestamptz not null default now(),
  activada_por   text not null,
  desactivada_en timestamptz,
  nota           text check (nota is null or char_length(nota) <= 500)
);

alter table public.api_acceso_estudios enable row level security;
revoke all on table public.api_acceso_estudios from public, anon, authenticated;
grant all on table public.api_acceso_estudios to service_role;

-- ── Claves ───────────────────────────────────────────────────────────────────
-- Solo se guarda el SHA-256 de la clave (lib/api-publica/claves.ts); la clave en
-- claro se enseña una vez. Nunca se borran: revocar es poner `revocada_en`, y la
-- fila queda para la auditoría.
create table if not exists public.api_claves (
  id            text primary key,
  studio_id     text not null references public.studios(id) on delete cascade,
  nombre        text not null check (char_length(btrim(nombre)) between 1 and 80),
  prefijo       text not null check (prefijo like 'tnt\_sk\_%'),
  hash          text not null unique check (hash ~ '^[0-9a-f]{64}$'),
  scopes        text[] not null check (cardinality(scopes) > 0),
  creada_por    uuid not null,
  creada_en     timestamptz not null default now(),
  expira_en     timestamptz,
  ultimo_uso_en timestamptz,
  ultimo_uso_ip text,
  revocada_en   timestamptz,
  revocada_por  uuid,
  -- Rotar crea una clave nueva con los mismos scopes y deja la vieja viva un
  -- tiempo (`expira_en`) para que el integrador cambie sin cortar.
  rotada_desde  text references public.api_claves(id)
);

create index if not exists api_claves_studio_idx on public.api_claves (studio_id, creada_en desc);

alter table public.api_claves enable row level security;
revoke all on table public.api_claves from public, anon, authenticated;
grant all on table public.api_claves to service_role;

-- ── Una sola auditoría para las dos credenciales ─────────────────────────────
-- `oauth_auditoria_accesos` exigía `cliente_id` (la app OAuth). Una llamada con
-- clave no tiene app: lleva `api_clave_id`. Exactamente una de las dos. Todas
-- las filas que hay ya tienen `cliente_id`, así que el CHECK vale desde ya.
alter table public.oauth_auditoria_accesos add column if not exists api_clave_id text;
alter table public.oauth_auditoria_accesos alter column cliente_id drop not null;
alter table public.oauth_auditoria_accesos drop constraint if exists oauth_auditoria_una_credencial;
alter table public.oauth_auditoria_accesos
  add constraint oauth_auditoria_una_credencial check (num_nonnulls(cliente_id, api_clave_id) = 1);
create index if not exists oauth_auditoria_api_clave_idx
  on public.oauth_auditoria_accesos (api_clave_id, creado_en desc) where api_clave_id is not null;

-- ── La purga de un estudio vencido borra también sus claves ──────────────────
-- Copia literal de la definición vigente (20260927021006_consultas_contacto),
-- con las dos tablas nuevas al final de `c_borrar`. Antes de reemplazarla se
-- comprueba que producción sigue teniendo ESA versión: si otra sesión la ha
-- cambiado entretanto, esto falla en vez de pisarla.
do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.purgar_estudio_vencido(text, boolean)'::regprocedure)
     <> '2fd5618f7c0bb9eb7e5b498e8292e497' then
    raise exception 'purgar_estudio_vencido ha cambiado desde 20260927021006: rehaz esta copia sobre la vigente';
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
    'backups', 'consultas_contacto',
    'api_claves', 'api_acceso_estudios'
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

revoke execute on function public.purgar_estudio_vencido(text, boolean) from public;
revoke execute on function public.purgar_estudio_vencido(text, boolean) from anon;
revoke execute on function public.purgar_estudio_vencido(text, boolean) from authenticated;
grant  execute on function public.purgar_estudio_vencido(text, boolean) to service_role;

do $$
declare
  v_def text := pg_get_functiondef('public.purgar_estudio_vencido(text, boolean)'::regprocedure);
begin
  if has_function_privilege('anon', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE') then
    raise exception 'purgar_estudio_vencido sigue siendo ejecutable por anon/authenticated';
  end if;
  if position('''api_claves''' in v_def) = 0 or position('''api_acceso_estudios''' in v_def) = 0
     or position('''consultas_contacto''' in v_def) = 0 then
    raise exception 'purgar_estudio_vencido no borra las claves de API del estudio';
  end if;
  if has_table_privilege('authenticated', 'public.api_claves', 'SELECT')
     or has_table_privilege('anon', 'public.api_claves', 'SELECT')
     or has_table_privilege('authenticated', 'public.api_acceso_estudios', 'SELECT') then
    raise exception 'las tablas de la API pública no pueden leerse desde el cliente';
  end if;
end $$;
