-- `anon` sin privilegios de tabla en el negocio, y políticas `TO authenticated`.
--
-- Auditoría RGPD/seguridad 2026-09-13, M9 / control C25.
--
-- 54 tablas de `public` conservaban GRANT de tabla a `anon` (SELECT, INSERT,
-- UPDATE, DELETE), restos de antes de que el default de `postgres` para tablas
-- dejara de concederlo. Lo único que las cerraba era la RLS. Comprobado en prod:
-- ninguna política de `public` es para `anon`, y las 32 creadas `TO public`
-- dependen de `current_studio_id()`. Denegar por RLS no es lo mismo que no
-- conceder: basta una política permisiva de más para abrirlas.
--
-- ¿Algún flujo sin sesión las lee por PostgREST con la clave anon? No.
--  · /reservar, /portal, el widget y el kiosko cargan por el proxy de servidor
--    (service_role): `cargarPublico` en lib/studio-context.tsx. El
--    StudioProvider raíz no pide nada sin sesión de personal.
--  · `lib/db/supabase-portal.ts` (alumna) solo usa Auth, nunca tablas.
--  · Lo anónimo legítimo que queda NO pasa por estas tablas y no se toca:
--    `studio_id_por_slug()` (RPC SECURITY DEFINER) y la difusión Realtime
--    `aforo:*` (política sobre realtime.messages).
--  · Las 11 columnas de `studios` con SELECT para anon (nombre, slug, colores…)
--    no son datos personales; quedan fuera de este cambio.
-- Si una pestaña de personal pierde la sesión, sus lecturas pasan a dar 42501
-- con la pista «… TO anon», que `esSesionAnonimaInesperada`
-- (lib/recuperar-sesion.ts) ya reconduce a refrescar la sesión.
--
-- Las políticas `TO public` pasan a `TO authenticated` sin tocar su condición:
-- todas exigen `current_studio_id()`, que sin sesión no resuelve nada.

-- Con datos personales directos (socio_id, instructor_id, email, teléfono, NIF,
-- auth_user_id): 31 tablas.
revoke all on table
  public.achievement_history,
  public.achievement_progress,
  public.actividad_reciente,
  public.automation_logs,
  public.challenge_history,
  public.challenge_progress,
  public.citas,
  public.citas_disponibilidad,
  public.credit_transactions,
  public.facturas,
  public.ingresos_manuales,
  public.instructora_disponibilidad,
  public.instructora_disponibilidad_excepciones,
  public.instructores,
  public.member_credits,
  public.memoria_socio,
  public.mensajes_equipo,
  public.notas_internas,
  public.notas_progreso,
  public.preferencias_socio,
  public.recibos,
  public.recomendaciones,
  public.reservas,
  public.reward_actions,
  public.reward_history,
  public.reward_redemptions,
  public.sesiones,
  public.suscripciones,
  public.sustitucion_contactos,
  public.usuarios,
  public.videos_on_demand
from anon;

-- Datos personales dentro de JSON o por referencia (copias, notificaciones,
-- soporte, decisiones, sustituciones…) o configuración del negocio: 23 tablas.
-- Ninguna tiene uso anónimo, así que el criterio es el mismo.
revoke all on table
  public.achievement_definitions,
  public.automation_rules,
  public.automatizaciones,
  public.backups,
  public.campanas,
  public.challenge_definitions,
  public.citas_servicios,
  public.codigos_descuento,
  public.dashboard_charts,
  public.decision_autonomia_config,
  public.decision_feature_flags,
  public.decision_sessions,
  public.level_definitions,
  public.notificaciones,
  public.planes_tarifa,
  public.productos_pos,
  public.recomendacion_outcomes,
  public.resumen_diario,
  public.reward_catalog,
  public.reward_rules,
  public.salas,
  public.soporte_solicitudes,
  public.sustituciones
from anon;

-- `studios` y `tipos_clase` solo conservaban MAINTAIN para anon (VACUUM, ANALYZE…,
-- inalcanzable por la API): fuera también. Las 11 columnas públicas de `studios`
-- son privilegios de COLUMNA y no se tocan (ensayado: siguen las 11).
revoke maintain on table public.studios, public.tipos_clase from anon;

alter policy achievement_definitions_delete on public.achievement_definitions to authenticated;
alter policy achievement_definitions_insert on public.achievement_definitions to authenticated;
alter policy achievement_definitions_lectura on public.achievement_definitions to authenticated;
alter policy achievement_definitions_update on public.achievement_definitions to authenticated;
alter policy challenge_definitions_delete on public.challenge_definitions to authenticated;
alter policy challenge_definitions_insert on public.challenge_definitions to authenticated;
alter policy challenge_definitions_lectura on public.challenge_definitions to authenticated;
alter policy challenge_definitions_update on public.challenge_definitions to authenticated;
alter policy admin_ingresos_manuales on public.ingresos_manuales to authenticated;
alter policy staff_lee_member_credits on public.member_credits to authenticated;
alter policy staff_escribe_mensajes_equipo on public.mensajes_equipo to authenticated;
alter policy staff_lee_mensajes_equipo on public.mensajes_equipo to authenticated;
alter policy movimientos_stock_lectura on public.movimientos_stock to authenticated;
alter policy productos_pos_escritura_delete on public.productos_pos to authenticated;
alter policy productos_pos_escritura_insert on public.productos_pos to authenticated;
alter policy productos_pos_escritura_update on public.productos_pos to authenticated;
alter policy productos_pos_lectura on public.productos_pos to authenticated;
alter policy review_boost_feedback_propietaria_insert on public.review_boost_feedback to authenticated;
alter policy review_boost_feedback_propietaria_select on public.review_boost_feedback to authenticated;
alter policy staff_lee_reward_actions on public.reward_actions to authenticated;
alter policy reward_catalog_delete on public.reward_catalog to authenticated;
alter policy reward_catalog_insert on public.reward_catalog to authenticated;
alter policy reward_catalog_lectura on public.reward_catalog to authenticated;
alter policy reward_catalog_update on public.reward_catalog to authenticated;
alter policy reward_redemptions_delete on public.reward_redemptions to authenticated;
alter policy reward_redemptions_insert on public.reward_redemptions to authenticated;
alter policy reward_redemptions_lectura on public.reward_redemptions to authenticated;
alter policy reward_redemptions_update on public.reward_redemptions to authenticated;
alter policy reward_rules_delete on public.reward_rules to authenticated;
alter policy reward_rules_insert on public.reward_rules to authenticated;
alter policy reward_rules_lectura on public.reward_rules to authenticated;
alter policy reward_rules_update on public.reward_rules to authenticated;

do $verificacion$
declare
  v_pendiente text;
begin
  select string_agg(distinct c.relname, ', ') into v_pendiente
    from pg_class c
    cross join lateral aclexplode(c.relacl) a
   where c.relnamespace = 'public'::regnamespace
     and a.grantee = 'anon'::regrole
     and c.relname = any (array[
       'achievement_history', 'achievement_progress', 'actividad_reciente', 'automation_logs',
       'challenge_history', 'challenge_progress', 'citas', 'citas_disponibilidad',
       'credit_transactions', 'facturas', 'ingresos_manuales', 'instructora_disponibilidad',
       'instructora_disponibilidad_excepciones', 'instructores', 'member_credits', 'memoria_socio',
       'mensajes_equipo', 'notas_internas', 'notas_progreso', 'preferencias_socio', 'recibos',
       'recomendaciones', 'reservas', 'reward_actions', 'reward_history', 'reward_redemptions',
       'sesiones', 'suscripciones', 'sustitucion_contactos', 'usuarios', 'videos_on_demand',
       'achievement_definitions', 'automation_rules', 'automatizaciones', 'backups', 'campanas',
       'challenge_definitions', 'citas_servicios', 'codigos_descuento', 'dashboard_charts',
       'decision_autonomia_config', 'decision_feature_flags', 'decision_sessions',
       'level_definitions', 'notificaciones', 'planes_tarifa', 'productos_pos',
       'recomendacion_outcomes', 'resumen_diario', 'reward_catalog', 'reward_rules', 'salas',
       'soporte_solicitudes', 'sustituciones', 'studios', 'tipos_clase'
     ]::name[]);
  if v_pendiente is not null then
    raise exception 'anon conserva privilegios de tabla en: %', v_pendiente;
  end if;

  select string_agg(tablename || '.' || policyname, ', ') into v_pendiente
    from pg_policies
   where schemaname = 'public'
     and 'public'::name = any (roles)
     and tablename = any (array[
       'achievement_definitions', 'challenge_definitions', 'ingresos_manuales', 'member_credits',
       'mensajes_equipo', 'movimientos_stock', 'productos_pos', 'review_boost_feedback',
       'reward_actions', 'reward_catalog', 'reward_redemptions', 'reward_rules'
     ]::name[]);
  if v_pendiente is not null then
    raise exception 'políticas que siguen TO public: %', v_pendiente;
  end if;
end
$verificacion$;
