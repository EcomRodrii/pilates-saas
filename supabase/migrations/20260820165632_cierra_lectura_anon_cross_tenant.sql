-- Auditoría 20-ago (hallazgo 🟠 anon): `anon` leía datos de TODOS los estudios
-- en 9 tablas con `studio_id`, por las policies `USING (true)` de 0000_base.
-- Verificado empíricamente con SET ROLE anon: salas (12 filas de 4 estudios),
-- tipos_clase (14 de 4), achievement_definitions (24 de 2), level_definitions
-- (11 de 2)… Sin PII ni credenciales, pero es configuración de negocio de
-- todos los tenants — incluido `videos_on_demand.stream_uid`.
--
-- Es la CONTINUACIÓN de 0091 (pentest L1), que cerró `sesiones` y
-- `planes_tarifa` con este mismo análisis y este mismo mecanismo: la página
-- pública /reservar NO lee estas tablas con la anon key — sus datos llegan por
-- `fetchPublicStudioData` (service-role, ignora RLS) — y el resto de
-- consumidores son o el panel (authenticated, cubierto por su policy `admin_*`
-- acotada a `current_studio_id()`, intacta) o rutas de servidor. Verificado
-- por grep exhaustivo: ni un solo `.from()` de estas tablas usa la clave
-- anónima en lib/, app/ ni components/. Las policies eran código muerto.
-- `contenido_portal`/`contenido_portal_banners` ya estaban cerradas por la
-- otra vía (revoke del GRANT); esto termina el trabajo con las 9 restantes.
--
-- Cinturón y tirantes, con los DOS mecanismos que el repo ya usa por separado:
--  · drop de la policy (patrón 0091) — RLS activo sin política = denegado;
--  · revoke del GRANT a anon (patrón contenido_portal) — si algún día alguien
--    añade una policy alegre, anon sigue sin privilegio de tabla.
--
-- Verificado en vivo con execute_sql + ROLLBACK antes de aplicar, CON control
-- positivo (la lección del 14-ago: sin él, «denegado» puede ser trivialmente
-- cierto): anon leía filas antes del cambio y lee 0 (o permission denied,
-- equivalente) en las 9 después.
--
-- authenticated y service_role: sin cambios de ningún tipo.

drop policy if exists public_read_salas on public.salas;
drop policy if exists public_read_spots on public.spots;
drop policy if exists public_read_tipos_clase on public.tipos_clase;
drop policy if exists public_read_videos_on_demand on public.videos_on_demand;
drop policy if exists public_read_achievement_definitions on public.achievement_definitions;
drop policy if exists public_read_challenge_definitions on public.challenge_definitions;
drop policy if exists public_read_level_definitions on public.level_definitions;
drop policy if exists public_read_reward_catalog on public.reward_catalog;
drop policy if exists public_read_reward_rules on public.reward_rules;

revoke select on public.salas, public.spots, public.tipos_clase, public.videos_on_demand,
  public.achievement_definitions, public.challenge_definitions, public.level_definitions,
  public.reward_catalog, public.reward_rules from anon;
