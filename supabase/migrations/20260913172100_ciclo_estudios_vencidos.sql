-- ═══════════════════════════════════════════════════════════════════════════
-- Ciclo de vida de los estudios cuya prueba venció sin pagar.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hasta hoy un estudio en `trial_expirado` se conservaba entero para siempre y
-- además se seguía copiando cada noche (prod, 2026-09-13: 5 estudios, 8 socias,
-- 2 fichas de salud, 89 copias). Decisión del usuario: parar las copias y avisar
-- a los 30 días, último aviso a los 83 y borrado a los 90.
--
-- ── TABLA DE PLAZOS ─────────────────────────────────────────────────────────
-- ⚠️ LEGAL: PENDIENTES DE VALIDAR por el abogado (y de reflejar en el contrato
-- de encargo, art. 28.3.g RGPD). Viven en lib/retencion/ciclo-estudios-vencidos.ts;
-- aquí solo el suelo de 90 días de la guardia de la BD.
--
--   días desde trial_ends_at   qué pasa
--   ────────────────────────   ─────────────────────────────────────────────
--   30   aviso_30              email a la propietaria («conservamos tus datos
--                              hasta el X; suscríbete o exporta») y dejan de
--                              hacerse copias nuevas (ejecutar-copia-diaria.ts)
--   83   aviso_final           último aviso
--   90   purga                 borrado de datos personales — SOLO si
--                              PURGA_ESTUDIOS_VENCIDOS=activa; sin la variable
--                              solo se registra en `resumen` qué borraría
--
-- Nunca se adelanta un paso: si un aviso sale tarde, los siguientes se corren
-- para respetar los huecos (53 días entre avisos, 7 entre el último y el
-- borrado). Si el estudio paga en medio, el ciclo se cancela (`cancelada_en`).
--
-- ── QUÉ BORRA LA PURGA ──────────────────────────────────────────────────────
-- NUNCA `DELETE FROM studios`: arrastraría en CASCADE facturas, recibos y
-- ventas (≈150 FKs). La fila del estudio se queda.
--   · socios        → ANONIMIZADAS con public.anonimizar_socio(text, text).
--                     ⚠️ Esa RPC la crea OTRA migración (en paralelo). Sin ella,
--                     el modo real se niega a arrancar (raise) antes de tocar
--                     nada; el modo informe lo avisa en `anonimizar_socio_disponible`.
--                     Si su firma final no es (text, text), ajustar aquí.
--   · instructores  → anonimizadas en sitio (sesiones/citas las referencian
--                     con NO ACTION, no se pueden borrar).
--   · c_borrar      → DELETE de salud, notas, comunicación, logs, analítica,
--                     gamificación, credenciales OAuth/integraciones y la
--                     metadata de las copias. Orden = hijas antes que madres
--                     (verificado contra pg_constraint en prod, 2026-09-13).
--   · Storage y R2  → los borra el servidor ANTES de llamar a esta función
--                     (lib/retencion/avanzar-ciclo-estudios-vencidos.ts).
--
-- ── SE CONSERVA (⚠️ LEGAL: plazo pendiente) ─────────────────────────────────
--   facturas, recibos, ventas_pos(+lineas), devoluciones, pagos_historicos,
--   mandatos_sepa, penalizaciones, liquidaciones_instructoras,
--   instructor_tarifas, lecturas_ficha_salud; reservas/suscripciones/sesiones
--   quedan seudonimizadas al anonimizar a las socias. La fila `studios` (datos
--   del emisor de las facturas) tampoco se toca. Network (red_*) y
--   plataforma_lead quedan fuera: son de terceros o de Tentare, no del estudio.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.ciclo_estudios_vencidos (
  id              bigint generated always as identity primary key,
  studio_id       text not null references public.studios(id) on delete cascade,
  -- Ancla del ciclo: si `trial_ends_at` cambiara, es otro ciclo, no este.
  trial_ends_at   timestamptz not null,
  fase            text not null check (fase in ('aviso_30', 'aviso_final', 'purga')),
  programada_para timestamptz not null,
  -- NULL = aún no hecha. En modo informe la fila de 'purga' vive con NULL aquí
  -- y el recuento en `resumen`: activar la variable la ejecuta en la pasada
  -- siguiente sin tener que tocar la tabla.
  ejecutada_en    timestamptz,
  cancelada_en    timestamptz,
  resumen         jsonb not null default '{}'::jsonb,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (studio_id, trial_ends_at, fase)
);

create index if not exists ciclo_estudios_vencidos_vivas
  on public.ciclo_estudios_vencidos (studio_id) where cancelada_en is null;

comment on table public.ciclo_estudios_vencidos is
  'Avisos y purga de estudios en trial_expirado (30/83/90 días, pendientes de validación legal). Solo service_role.';

-- Solo el servidor. Sin políticas: RLS activada deja fuera a anon/authenticated,
-- y el REVOKE explícito cubre los GRANT por defecto de tabla nueva.
alter table public.ciclo_estudios_vencidos enable row level security;
revoke all on table public.ciclo_estudios_vencidos from public, anon, authenticated;
grant select, insert, update, delete on table public.ciclo_estudios_vencidos to service_role;

-- ── purgar_estudio_vencido ─────────────────────────────────────────────────
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
    'instructor_bajas_seguimiento', 'instructor_dependency_snapshots', 'sustitucion_contactos',
    'oauth_auditoria_accesos', 'oauth_codigos_autorizacion', 'oauth_tokens', 'oauth_consentimientos',
    'integracion_credenciales', 'migracion_batches', 'resumen_semanal_envios', 'soporte_solicitudes',
    'backups'
  ];
  c_conservar constant text[] := array[
    'facturas', 'recibos', 'ventas_pos', 'devoluciones', 'pagos_historicos', 'mandatos_sepa',
    'penalizaciones', 'liquidaciones_instructoras', 'instructor_tarifas', 'lecturas_ficha_salud',
    'reservas', 'suscripciones'
  ];
  v_estudio     record;
  v_tabla       text;
  v_n           bigint;
  v_borrar      jsonb := '{}'::jsonb;
  v_conservar   jsonb := '{}'::jsonb;
  v_socio       record;
  v_n_socias    bigint;
  v_n_instr     bigint;
  v_anonimizar  boolean := to_regprocedure('public.anonimizar_socio(text,text)') is not null;
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
    raise exception 'purgar_estudio_vencido: falta public.anonimizar_socio(text, text); no se purga sin anonimizar a las socias';
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
begin
  if has_function_privilege('anon', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE') then
    raise exception 'purgar_estudio_vencido sigue siendo ejecutable por anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.purgar_estudio_vencido(text, boolean)', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar purgar_estudio_vencido';
  end if;
  if has_table_privilege('anon', 'public.ciclo_estudios_vencidos', 'SELECT')
     or has_table_privilege('authenticated', 'public.ciclo_estudios_vencidos', 'SELECT') then
    raise exception 'ciclo_estudios_vencidos sigue siendo legible por anon/authenticated';
  end if;
end $$;
