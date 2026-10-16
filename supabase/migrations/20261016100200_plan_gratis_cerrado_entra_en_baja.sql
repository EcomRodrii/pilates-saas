-- ═══════════════════════════════════════════════════════════════════════════
-- Un estudio gratis que lleva 90 días CERRADO entra en el ciclo de baja de un
-- estudio de pago: los mismos avisos de «descarga tus datos» y la misma purga a
-- los 30 días, tras el mismo interruptor (PURGA_ESTUDIOS_VENCIDOS, apagado).
-- Decisión del fundador (16-oct-2026). Y `studios.creado_en` lo pone el servidor.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── 1) La regla, UNA vez: `plan_gratis_entra_en_baja` ───────────────────────
-- Founding Studio gratis (lib/billing/plan-gratis.ts): al pasar un límite hay 30
-- días de margen y después el panel se cierra (la app de las alumnas sigue). El
-- cierre lo DERIVA el gate en cada petición (`estadoGratis`): un estudio cuya
-- dueña no vuelve a entrar sigue diciendo 'gratis' en la base aunque esté
-- cerrado. Por eso la regla mira 'gratis' y 'gratis_cerrado' por igual, con la
-- fecha y no con el estado.
--
--   cerrado desde  = el fin del margen: excedido_desde + 30 (MARGEN_DIAS), en
--                    días de Madrid (excedido_desde ya es un día de Madrid). Si
--                    el estudio entró en el plan gratis DESPUÉS (otro estudio
--                    gratis de la misma dueña que nace ya cerrado porque el
--                    grupo se pasó hace meses: `excedido_desde` es del grupo),
--                    desde el día en que se midió por primera vez
--                    (`uso_plan_gratis.creado_en`): nadie entra en baja sin
--                    haber estado él mismo 90 días cerrado.
--   entra en baja  = el día `cerrado desde + 90` a las 00:00 de Madrid
--                    (`hoy_estudio()`, nunca current_date).
--
-- `contrato_terminado_en` se pone ese día o en cuanto alguien lo mira después
-- (`now()`): los 30 días para descargar empiezan a contar cuando se avisa, nunca
-- antes. Si paga (sale del plan gratis), el trigger vacía la fecha y la
-- petición de borrado, y el ciclo se cancela, como al reactivar un plan.
--
-- ⚠️ LEGAL: los 90 días (DIAS_PLAN_GRATIS_CERRADO_ANTES_DE_BAJA en
-- lib/retencion/ciclo-estudios-vencidos.ts) esperan, como el resto de plazos del
-- ciclo, el visto bueno de la gestoría. Un test cruza la constante con esta función.
--
-- ── 2) `cadena_con_otra_sede_viva`: la excepción de las cadenas (#2736) ──────
-- Una sede cerrada no termina contrato mientras otra sede de su cadena lleve
-- plan propio vivo (subscription_status no nulo y distinto de canceled /
-- incomplete_expired: el gratis de la principal o un plan suelto), salvo que ESA
-- sede haya pedido el borrado. Ahora vale también para la principal en el plan
-- gratis (no entra en baja si otra sede paga su plan suelto) y la usa la guardia
-- de la purga. Un plan gratis que ya lleva 90 días cerrado NO cuenta como vivo:
-- su dueña dejó Tentare, y si contara, las demás sedes de la cadena se
-- conservarían para siempre (el estado de la principal no cambia al purgarla).
--
-- `baja_del_plan_gratis` junta las dos para una sede gratis: la regla de 1, su
-- cadena sin pagar ni con un pago de Cadena en marcha ('incomplete', 'unpaid':
-- nada de «descarga tus datos» en mitad de un 3DS), y la excepción de 2. Es lo
-- que deciden el trigger, el reloj y la guardia: una sola vez.
--
-- ── 3) El reloj: `reevaluar_baja_plan_gratis` ───────────────────────────────
-- Un trigger no se dispara porque pase el tiempo. El barrido horario del ciclo
-- (lib/retencion/avanzar-ciclo-estudios-vencidos.ts, colgado del cron
-- notif-trial: sin cron nuevo) llama a esta función ANTES de leer quién está en
-- baja. Vuelve a pasar por `fijar_contrato_terminado` las filas cuya fecha NO
-- coincide con lo que decidiría el trigger hoy, en los dos sentidos: los
-- estudios gratis y las sedes que siguen a una cadena terminada. Por desajuste y
-- no por «los que aún no tienen fecha»: así no depende de quién se llevó la
-- transición (cualquier otro UPDATE de la fila la pone, y entonces sus sedes
-- hermanas no se recalculaban nunca), ni de un estado que se quedó viejo, y no
-- reescribe cada hora a quien sigue igual. No decide nada: decide el trigger.
--
-- ── 4) La guardia de `purgar_estudio_vencido` ───────────────────────────────
-- Admite el plan gratis en baja (`baja_del_plan_gratis`, la misma de arriba), y
-- además, en una sede, se niega si otra sede de la cadena lleva plan propio vivo
-- (defensa en profundidad: lo pidió la revisión de tentare-supabase de #2736).
-- Salvo, otra vez, que la sede haya pedido el borrado: si no, una petición que
-- el trigger respeta no se cumpliría nunca. «La que manda» se mira como en el
-- trigger: una sede con plan propio vivo, por el suyo.
--
-- ── 5) `studios.creado_en` lo pone el servidor ──────────────────────────────
-- Con ella se elige la sede PRINCIPAL de una cadena, la más antigua
-- (`leerCadenaParaGratis`, y con ella `decidirPlanSuelto`). Un trigger pone
-- now() en el alta, salvo para el servidor (`es_llamada_servicio()`:
-- service_role, y postgres en seed.sql y en las migraciones). Nadie en el
-- código manda `creado_en` al crear un estudio (dbCreateStudio,
-- /api/cadena/sedes, scripts/recuperar-altas-huerfanas.ts); solo seed.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- Toca `studios` (candado al crear el trigger): mejor fallar que hacer cola
-- detrás del tráfico del panel.
set local lock_timeout = '5s';

-- Guarda: las tres funciones que se reescriben tienen que ser las vigentes sobre
-- las que se hizo esta copia (huella del cuerpo sin comentarios ni espacios,
-- comprobada en producción el 16-oct: la de 20261015141653 y la de 20261007143246).
do $$
declare
  v record;
  v_huella text;
begin
  for v in
    select * from (values
      ('public.fijar_contrato_terminado()', '7470ac716a0a880cc22c0d3e7f1a9b4a'),
      ('public.recalcular_contrato_sedes_hermanas()', 'b002cac9dede2bfc082832ff3dfa77d3'),
      ('public.purgar_estudio_vencido(text,boolean)', '636fe167ac5eb739d557749047b8c74d')
    ) as t(firma, huella)
  loop
    select md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
      into v_huella from pg_proc p where p.oid = to_regprocedure(v.firma);
    if v_huella is distinct from v.huella then
      raise exception '% ha cambiado (huella %): rehaz esta migración sobre la vigente', v.firma, v_huella;
    end if;
  end loop;
end $$;

-- ── 1) plan_gratis_entra_en_baja ────────────────────────────────────────────
-- Recibe el estado y no lo lee: en un BEFORE, el estado que cuenta es el de NEW,
-- que aún no está en la tabla. `p_hoy` es para las pruebas; por defecto, el día
-- de Madrid.
create or replace function public.plan_gratis_entra_en_baja(
  p_studio_id text, p_estado text, p_hoy date default public.hoy_estudio()
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_estado in ('gratis', 'gratis_cerrado'), false) and exists (
    select 1 from public.uso_plan_gratis u
     where u.studio_id = p_studio_id
       and u.excedido_desde is not null
       -- Cerrado desde el fin del margen (30 días) o desde que entró en el plan
       -- gratis, lo que sea más tarde; en baja a los 90 días de eso.
       and p_hoy >= greatest(u.excedido_desde + 30, (u.creado_en at time zone 'Europe/Madrid')::date) + 90
  );
$$;

comment on function public.plan_gratis_entra_en_baja(text, text, date) is
  'Founding Studio gratis: ¿lleva este estudio 90 días cerrado (desde el fin de los 30 días de margen, en días de Madrid)? Entonces entra en el ciclo de baja (fijar_contrato_terminado). Solo servidor.';

revoke execute on function public.plan_gratis_entra_en_baja(text, text, date) from public, anon, authenticated;
grant execute on function public.plan_gratis_entra_en_baja(text, text, date) to service_role;

-- ── 2) cadena_con_otra_sede_viva ────────────────────────────────────────────
create or replace function public.cadena_con_otra_sede_viva(p_cadena_id text, p_sin_studio_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.studios s
     where s.cadena_id = p_cadena_id and s.id <> p_sin_studio_id
       -- Cualquier otro estado cuenta como vivo, también uno raro en una sede
       -- ('trial_expirado', 'unpaid'): ante la duda, no se borra nada.
       and s.subscription_status is not null
       and s.subscription_status not in ('canceled', 'incomplete_expired')
       -- Un plan gratis con 90 días cerrado ya no es un plan vivo.
       and not public.plan_gratis_entra_en_baja(s.id, s.subscription_status)
  );
$$;

comment on function public.cadena_con_otra_sede_viva(text, text) is
  '¿Lleva otra sede de la cadena un plan propio vivo (el gratis de la principal, o un plan suelto)? Mientras sí, la dueña sigue siendo clienta: las sedes cerradas no terminan contrato ni se purgan. Solo servidor.';

revoke execute on function public.cadena_con_otra_sede_viva(text, text) from public, anon, authenticated;
grant execute on function public.cadena_con_otra_sede_viva(text, text) to service_role;

-- ── baja_del_plan_gratis ────────────────────────────────────────────────────
-- `p_pedida` es la petición de borrado que YA tenía (OLD en el trigger).
create or replace function public.baja_del_plan_gratis(
  p_studio_id text, p_estado text, p_cadena_id text, p_pedida timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.plan_gratis_entra_en_baja(p_studio_id, p_estado)
     and (p_cadena_id is null or (
           -- Ni con la cadena pagando ni con un pago de Cadena en marcha.
           not exists (select 1 from public.cadenas c
                        where c.id = p_cadena_id
                          and c.subscription_status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete'))
           and (p_pedida is not null or not public.cadena_con_otra_sede_viva(p_cadena_id, p_studio_id))
         ));
$$;

comment on function public.baja_del_plan_gratis(text, text, text, timestamptz) is
  'Un estudio en el plan gratis, ¿en baja? 90 días cerrado (plan_gratis_entra_en_baja), su cadena sin pagar ni a medio pagar, y ninguna otra sede de la cadena con plan propio vivo salvo que este estudio pidiera el borrado. La usan fijar_contrato_terminado, reevaluar_baja_plan_gratis y purgar_estudio_vencido. Solo servidor.';

revoke execute on function public.baja_del_plan_gratis(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.baja_del_plan_gratis(text, text, text, timestamptz) to service_role;

-- ── fijar_contrato_terminado ────────────────────────────────────────────────
-- Copia de la vigente (migr 20261015141653) salvo: la excepción de la cadena va
-- por `cadena_con_otra_sede_viva`, y el bloque nuevo del plan gratis.
create or replace function public.fijar_contrato_terminado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado text := new.subscription_status;
  -- La petición de borrado que YA tenía la sede (nunca la de NEW: la trae el cliente).
  v_pedida timestamptz;
  v_terminado boolean;
begin
  if tg_op = 'UPDATE' then
    v_pedida := old.supresion_pedida_en;
  end if;
  -- Una sede se rige por su cadena, salvo que lleve un plan PROPIO vivo (la
  -- principal en el plan gratis, o una sede pagando su plan suelto).
  if new.cadena_id is not null and (v_estado is null or v_estado in ('canceled', 'incomplete_expired')) then
    -- Sin cadena encontrada, NULL: no es baja (ante la duda, no se purga).
    select c.subscription_status into v_estado from public.cadenas c where c.id = new.cadena_id;
    -- La cadena dejó de pagar, pero su dueña sigue siendo clienta mientras otra
    -- sede de la cadena lleve plan propio: esta se queda cerrada, sin borrar
    -- nada. Salvo que esta sede ya haya pedido el borrado.
    if v_estado in ('canceled', 'incomplete_expired') and v_pedida is null
       and public.cadena_con_otra_sede_viva(new.cadena_id, new.id) then
      v_estado := null;
    end if;
  end if;
  -- O el plan gratis con 90 días cerrado (`baja_del_plan_gratis`): termina como
  -- un plan de pago. En una sede, con la misma excepción de la cadena.
  v_terminado := coalesce(v_estado in ('canceled', 'incomplete_expired'), false)
                 or public.baja_del_plan_gratis(new.id, v_estado, new.cadena_id, v_pedida);
  -- Lo que mande el cliente en esta columna se ignora siempre: la fecha la pone
  -- este trigger, o una fecha falsa adelantaría el borrado.
  if v_terminado then
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

revoke execute on function public.fijar_contrato_terminado() from public, anon, authenticated;
grant execute on function public.fijar_contrato_terminado() to service_role;

-- ── recalcular_contrato_sedes_hermanas ──────────────────────────────────────
-- Copia de la vigente (migr 20261015141653) salvo que también recalcula la sede
-- en el plan gratis: si otra sede empieza o deja de pagar su plan suelto, la
-- principal entra o sale de la baja al momento, no en el siguiente barrido.
create or replace function public.recalcular_contrato_sedes_hermanas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Con la cadena pagando (o a medio pagar), cada sede se resuelve con su
  -- propia fila: no hay nada que recalcular en las demás.
  if exists (select 1 from public.cadenas c
              where c.id = new.cadena_id and c.subscription_status in ('canceled', 'incomplete_expired')) then
    -- El valor da igual: `fijar_contrato_terminado` lo recalcula (ignora lo que llega).
    -- No se llama a sí mismo: este UPDATE no lleva `subscription_status` en el SET.
    update public.studios s
       set contrato_terminado_en = s.contrato_terminado_en
     where s.cadena_id = new.cadena_id and s.id <> new.id
       and (s.subscription_status is null
            or s.subscription_status in ('canceled', 'incomplete_expired', 'gratis', 'gratis_cerrado'));
  end if;
  return null;
end;
$$;

revoke execute on function public.recalcular_contrato_sedes_hermanas() from public, anon, authenticated;
grant execute on function public.recalcular_contrato_sedes_hermanas() to service_role;

-- ── 3) reevaluar_baja_plan_gratis ───────────────────────────────────────────
-- Devuelve cuántas filas ha vuelto a pasar por el trigger (las desajustadas).
-- Cada condición es la decisión de `fijar_contrato_terminado` para ese caso, con
-- `supresion_pedida_en` como la petición que ya tenía.
create or replace function public.reevaluar_baja_plan_gratis()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gratis integer;
  v_sedes integer;
begin
  -- Los estudios gratis: entran al cumplir los 90 días; salen si dejan de
  -- cumplir (otra sede de la cadena paga, un pago de Cadena en marcha, o una
  -- medición vieja que ya no está).
  update public.studios s
     set contrato_terminado_en = s.contrato_terminado_en
   where s.subscription_status in ('gratis', 'gratis_cerrado')
     and (s.contrato_terminado_en is not null)
         is distinct from public.baja_del_plan_gratis(s.id, s.subscription_status, s.cadena_id, s.supresion_pedida_en);
  get diagnostics v_gratis = row_count;

  -- Las sedes que siguen a una cadena terminada: con la principal en baja ya no
  -- hay quien las conserve (`cadena_con_otra_sede_viva` mira la fecha de la
  -- principal, no su fila: no depende del orden).
  update public.studios s
     set contrato_terminado_en = s.contrato_terminado_en
   where s.cadena_id is not null
     and (s.subscription_status is null or s.subscription_status in ('canceled', 'incomplete_expired'))
     and exists (select 1 from public.cadenas c
                  where c.id = s.cadena_id and c.subscription_status in ('canceled', 'incomplete_expired'))
     and (s.contrato_terminado_en is not null)
         is distinct from (s.supresion_pedida_en is not null or not public.cadena_con_otra_sede_viva(s.cadena_id, s.id));
  get diagnostics v_sedes = row_count;

  return v_gratis + v_sedes;
end;
$$;

comment on function public.reevaluar_baja_plan_gratis() is
  'El reloj de la baja del plan gratis: vuelve a pasar por fijar_contrato_terminado los estudios gratis y las sedes de una cadena terminada cuya fecha no coincide con lo que decidiría hoy. Lo llama el barrido del ciclo de baja (lib/retencion/avanzar-ciclo-estudios-vencidos.ts). Solo service_role.';

revoke execute on function public.reevaluar_baja_plan_gratis() from public, anon, authenticated;
grant execute on function public.reevaluar_baja_plan_gratis() to service_role;

-- ── 4) purgar_estudio_vencido ───────────────────────────────────────────────
-- Copia literal de la vigente (20261007143246) salvo la guardia.
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
  -- Tres casos y nada más: la prueba local vencida sin suscripción hace 90 días;
  -- la baja de un estudio de pago hace 30 (o antes, si la propietaria lo pidió
  -- con el contrato ya terminado), con la suscripción QUE MANDA terminada
  -- todavía hoy; o la baja, igual, de un plan gratis que lleva 90 días cerrado
  -- (`baja_del_plan_gratis`, la misma decisión que pone la fecha).
  -- `contrato_terminado_en` solo no basta: se mira también el estado, por si la
  -- fecha quedara desfasada.
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
      and (
        -- La que manda, como en fijar_contrato_terminado: la del estudio si va
        -- suelto o lleva plan propio vivo; si no, la de su cadena.
        (case when v_estudio.cadena_id is null
                   or coalesce(v_estudio.subscription_status, 'canceled') not in ('canceled', 'incomplete_expired')
              then v_estudio.subscription_status else v_estudio.estado_cadena end)
          in ('canceled', 'incomplete_expired')
        or public.baja_del_plan_gratis(v_estudio.id, v_estudio.subscription_status, v_estudio.cadena_id,
                                       v_estudio.supresion_pedida_en)
      ), false)
  ) then
    raise exception 'purgar_estudio_vencido: % no lleva 90 días con la prueba vencida ni 30 de baja', p_studio_id;
  end if;

  -- Una sede, nunca mientras otra sede de su cadena lleve plan propio vivo: la
  -- dueña sigue siendo clienta (migr 20261015141653). Salvo que ESTA sede haya
  -- pedido el borrado, que fijar_contrato_terminado también respeta: si no, esa
  -- petición no se cumpliría nunca.
  if v_estudio.cadena_id is not null and v_estudio.supresion_pedida_en is null
     and public.cadena_con_otra_sede_viva(v_estudio.cadena_id, v_estudio.id) then
    raise exception 'purgar_estudio_vencido: otra sede de la cadena de % sigue con plan propio', p_studio_id;
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

comment on function public.purgar_estudio_vencido(text, boolean) is
  'Borra/anonimiza los datos personales de un estudio sin contrato: prueba vencida >90 días, baja de pago >30 días o plan gratis con 90 días cerrado y >30 de baja (p_ejecutar=false: solo recuentos). Nunca una sede mientras otra de su cadena lleve plan propio vivo, salvo que la sede lo pidiera. Nunca borra studios ni datos fiscales. Solo service_role.';

revoke execute on function public.purgar_estudio_vencido(text, boolean) from public, anon, authenticated;
grant  execute on function public.purgar_estudio_vencido(text, boolean) to service_role;

-- ── 5) studios.creado_en lo pone el servidor ────────────────────────────────
-- Invoker, como studios_widget_dominios_solo_servidor: `es_llamada_servicio()`
-- tiene que ver el rol de quien escribe.
create or replace function public.studios_creado_en_solo_servidor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.es_llamada_servicio() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.creado_en := now();
  elsif new.creado_en is distinct from old.creado_en then
    new.creado_en := old.creado_en;
  end if;
  return new;
end;
$$;

-- Función de trigger: el permiso se comprueba al crear el trigger, no al dispararse.
revoke execute on function public.studios_creado_en_solo_servidor() from public, anon, authenticated;
grant execute on function public.studios_creado_en_solo_servidor() to service_role;

drop trigger if exists trg_studios_creado_en_solo_servidor on public.studios;
create trigger trg_studios_creado_en_solo_servidor
  before insert or update of creado_en on public.studios
  for each row execute function public.studios_creado_en_solo_servidor();

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
declare
  f text;
  v_def text := pg_get_functiondef('public.purgar_estudio_vencido(text, boolean)'::regprocedure);
begin
  -- Todas, solo para el servidor.
  foreach f in array array[
    'public.plan_gratis_entra_en_baja(text, text, date)', 'public.cadena_con_otra_sede_viva(text, text)',
    'public.baja_del_plan_gratis(text, text, text, timestamp with time zone)', 'public.fijar_contrato_terminado()', 'public.recalcular_contrato_sedes_hermanas()',
    'public.reevaluar_baja_plan_gratis()', 'public.purgar_estudio_vencido(text, boolean)',
    'public.studios_creado_en_solo_servidor()'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception '% tiene que ser solo de service_role (anon %, authenticated %, service_role %)', f,
        has_function_privilege('anon', f, 'EXECUTE'), has_function_privilege('authenticated', f, 'EXECUTE'),
        has_function_privilege('service_role', f, 'EXECUTE');
    end if;
  end loop;
  -- La purga es la de esta migración, sobre la de 20261007143246.
  if position('baja_del_plan_gratis' in v_def) = 0 or position('cadena_con_otra_sede_viva' in v_def) = 0
     or position('''plataforma_cupos''' in v_def) = 0 or position('''id_cliente_externo''' in v_def) = 0
     or position('c_borrar_si_existe' in v_def) = 0 then
    raise exception 'purgar_estudio_vencido no es la versión de esta migración';
  end if;
  -- El «hoy» de la regla es el de Madrid.
  if pg_get_function_arguments('public.plan_gratis_entra_en_baja(text, text, date)'::regprocedure) !~ 'hoy_estudio\(\)' then
    raise exception 'plan_gratis_entra_en_baja: el día por defecto tiene que ser public.hoy_estudio()';
  end if;
  foreach f in array array['trg_studios_contrato_terminado', 'trg_studios_contrato_sedes_hermanas', 'trg_studios_creado_en_solo_servidor'] loop
    if not exists (select 1 from pg_trigger where tgname = f and tgrelid = 'public.studios'::regclass and not tgisinternal) then
      raise exception 'falta el trigger %', f;
    end if;
  end loop;
end $$;
