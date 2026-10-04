-- ═══════════════════════════════════════════════════════════════════════════
-- Fin del contrato de un estudio de pago: plazo para descargar y supresión.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El ciclo de 20260913220947 solo cubría la prueba gratuita vencida sin pagar.
-- Un estudio que pagaba y deja de hacerlo se conservaba entero para siempre, y
-- el contrato de encargo (art. 28.3.g RGPD) obliga a devolver y suprimir al
-- terminar. Decisión del fundador (2-oct-2026): 30 días para descargar y después
-- la MISMA purga, con el MISMO interruptor (`PURGA_ESTUDIOS_VENCIDOS=activa`).
--
-- ── TABLA DE PLAZOS (⚠️ LEGAL: pendientes de validar por el abogado) ─────────
--   días desde contrato_terminado_en   qué pasa
--   ────────────────────────────────   ───────────────────────────────────────
--   0    aviso_baja    email «descarga tus datos antes del X»; dejan de hacerse
--                      copias nuevas (las que hay se borran con la purga)
--   23   aviso_final   último aviso
--   30   purga         la de siempre: anonimiza clientas y equipo, borra salud,
--                      notas, mensajes, credenciales y copias; conserva lo fiscal
-- Viven en lib/retencion/ciclo-estudios-vencidos.ts; aquí solo el suelo de la
-- guardia. Si reactiva el plan en medio, el trigger vacía la fecha y el ciclo se
-- cancela.
--
-- «O antes si lo pide» (contrato de encargo, cláusula adicional): con el
-- contrato ya terminado, la propietaria puede pedir el borrado sin esperar a
-- los 30 días (/api/estudio/supresion). Queda en `supresion_pedida_en`, que
-- solo escribe el servidor, y la guardia de la purga lo admite. Tras borrar, se
-- le confirma por correo (lib/retencion/avanzar-ciclo-estudios-vencidos.ts).
--
-- ⚠️ El ancla NO es `subscription_status = 'canceled'` a secas. Una sede que pasa
-- a plan de cadena recibe el `canceled` de su suscripción SUELTA (Stripe la
-- cancela al confirmar la de cadena, lib/billing/cancelar-suscripcion-anterior.ts)
-- aunque su cadena pague. Por eso `contrato_terminado_en` lo fija un trigger que
-- mira la suscripción QUE MANDA —la del estudio si va suelto, la de su cadena si
-- es sede— y la guardia de la purga lo vuelve a comprobar en la BD.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── studios.contrato_terminado_en ───────────────────────────────────────────
alter table public.studios add column if not exists contrato_terminado_en timestamptz;

comment on column public.studios.contrato_terminado_en is
  'Cuándo terminó la suscripción de pago que manda (la del estudio o, en una sede, la de su cadena). La fija trg_studios_contrato_terminado; NULL mientras hay contrato. Ancla del ciclo de baja (aviso, 23 y 30 días).';

alter table public.studios add column if not exists supresion_pedida_en timestamptz;
comment on column public.studios.supresion_pedida_en is
  'La propietaria pidió borrar ya los datos del estudio, sin esperar a los 30 días de la baja. Solo con el contrato terminado y solo la escribe el servidor (/api/estudio/supresion); una reactivación la vacía.';

-- Relleno ANTES del trigger, con la fecha del evento de Stripe que lo dejó así.
update public.studios s
   set contrato_terminado_en = coalesce(c.subscription_evento_en, s.subscription_evento_en, now())
  from (select s2.id, case when s2.cadena_id is null then s2.subscription_status else c2.subscription_status end as estado,
               c2.subscription_evento_en
          from public.studios s2 left join public.cadenas c2 on c2.id = s2.cadena_id) c
 where c.id = s.id
   and c.estado in ('canceled', 'incomplete_expired')
   and s.contrato_terminado_en is null;

-- SECURITY DEFINER: lee `cadenas` aunque quien actualiza el estudio (la
-- propietaria desde el panel) no pueda verla por RLS. Como invoker, esa lectura
-- saldría vacía y una edición cualquiera borraría la fecha de una sede dada de baja.
create or replace function public.fijar_contrato_terminado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado text := new.subscription_status;
begin
  if new.cadena_id is not null then
    -- Sin cadena encontrada, NULL: no es baja (ante la duda, no se purga).
    select c.subscription_status into v_estado from public.cadenas c where c.id = new.cadena_id;
  end if;
  -- Lo que mande el cliente en esta columna se ignora siempre: la fecha la pone
  -- este trigger, o una fecha falsa adelantaría el borrado.
  if v_estado in ('canceled', 'incomplete_expired') then
    new.contrato_terminado_en := case when tg_op = 'UPDATE' then coalesce(old.contrato_terminado_en, now()) else now() end;
    -- La petición de borrado anticipado solo la escribe el servidor.
    if tg_op = 'INSERT' then
      new.supresion_pedida_en := null;
    elsif new.supresion_pedida_en is distinct from old.supresion_pedida_en and not public.es_llamada_servicio() then
      new.supresion_pedida_en := old.supresion_pedida_en;
    end if;
  else
    -- Con contrato no hay nada que borrar, y reactivar anula una petición anterior.
    new.contrato_terminado_en := null;
    new.supresion_pedida_en := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.fijar_contrato_terminado() from public;
revoke execute on function public.fijar_contrato_terminado() from anon;
revoke execute on function public.fijar_contrato_terminado() from authenticated;

-- Nombre posterior en orden alfabético a trg_heredar_plan_de_cadena (BEFORE
-- INSERT), para ver ya el estado heredado de la cadena.
drop trigger if exists trg_studios_contrato_terminado on public.studios;
create trigger trg_studios_contrato_terminado
  before insert or update on public.studios
  for each row execute function public.fijar_contrato_terminado();

-- ── ciclo_estudios_vencidos: un segundo motivo ──────────────────────────────
alter table public.ciclo_estudios_vencidos
  add column if not exists motivo text not null default 'prueba_vencida';
alter table public.ciclo_estudios_vencidos drop constraint if exists ciclo_estudios_vencidos_motivo_check;
alter table public.ciclo_estudios_vencidos
  add constraint ciclo_estudios_vencidos_motivo_check check (motivo in ('prueba_vencida', 'baja'));
alter table public.ciclo_estudios_vencidos drop constraint if exists ciclo_estudios_vencidos_fase_check;
alter table public.ciclo_estudios_vencidos
  add constraint ciclo_estudios_vencidos_fase_check check (
    fase in ('aviso_30', 'aviso_baja', 'aviso_final', 'purga')
    and (fase <> 'aviso_30' or motivo = 'prueba_vencida')
    and (fase <> 'aviso_baja' or motivo = 'baja')
  );

comment on column public.ciclo_estudios_vencidos.trial_ends_at is
  'Ancla del ciclo: studios.trial_ends_at (motivo prueba_vencida) o studios.contrato_terminado_en (motivo baja). Se llama así porque al principio solo existía el primero.';
comment on table public.ciclo_estudios_vencidos is
  'Avisos y purga de un estudio sin contrato: prueba vencida sin pagar (30/83/90 días) o baja de un estudio de pago (0/23/30). Plazos pendientes de validación legal. Solo service_role.';

-- ── purgar_estudio_vencido: la guardia admite también la baja ───────────────
-- Copia literal de la definición vigente salvo la guardia. La vigente es otra
-- vez la de 20261001162731_api_webhooks: 20261003002752_retirar_cobros_externos
-- la devuelve tal cual (sin cobros_externos ni sus lotes), y esta migración va
-- DESPUÉS de esa. Se comprueba antes que producción tiene ESA versión: si otra
-- sesión la ha cambiado entretanto, esto falla en vez de pisarla.
do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.purgar_estudio_vencido(text, boolean)'::regprocedure)
     <> '9644ba2b508b97e95cfde21831d8cec8' then
    raise exception 'purgar_estudio_vencido no es la de 20261001162731 (que devuelve 20261003002752): rehaz esta copia sobre la vigente';
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
    'api_webhook_entregas', 'api_webhooks', 'api_eventos', 'api_claves', 'api_acceso_estudios'
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
  'Borra/anonimiza los datos personales de un estudio sin contrato: prueba vencida >90 días o baja de pago >30 días (p_ejecutar=false: solo recuentos). Nunca borra studios ni datos fiscales. Solo service_role.';

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
    if has_function_privilege(v_rol, 'public.fijar_contrato_terminado()', 'EXECUTE') then
      raise exception '% puede ejecutar fijar_contrato_terminado', v_rol;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar purgar_estudio_vencido';
  end if;
  if position('c_dias_minimos_baja' in v_def) = 0 or position('''api_webhook_entregas''' in v_def) = 0 then
    raise exception 'purgar_estudio_vencido no es la versión de esta migración';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_studios_contrato_terminado'
                   and tgrelid = 'public.studios'::regclass and not tgisinternal) then
    raise exception 'falta el trigger trg_studios_contrato_terminado';
  end if;
end $$;
