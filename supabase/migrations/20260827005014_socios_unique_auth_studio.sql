-- 17ª auditoría (P-6): `handleSignContract` (widget público de reserva,
-- app/reservar/[slug]/page.tsx) no tenía ningún cerrojo contra doble clic, y
-- `socios` no tiene ningún UNIQUE que impida a nivel de servidor que dos
-- pulsaciones muy rápidas den de alta DOS fichas para la misma persona
-- (`registrarSociaPublica`, lib/db/supabase-data-admin.ts, hace un
-- check-then-insert sin candado: SELECT "¿ya existe?" seguido de un INSERT,
-- sin transacción). El cerrojo de cliente ya cierra el caso normal; esta
-- constraint cierra la ventana de red/reintento que el cerrojo de cliente por
-- sí solo no puede — mismo patrón que `instructores_auth_studio_unique`
-- (20260731003736, P2-14).
--
-- Verificado con execute_sql antes de escribir esta migración: cero
-- duplicados reales en prod hoy (`group by auth_user_id, studio_id having
-- count(*) > 1` sobre socios con auth_user_id no nulo), así que no hace
-- falta migración de limpieza previa. NULLs no chocan entre sí en un índice
-- UNIQUE de Postgres, así que las socias sin cuenta (importadas, leads) no
-- se ven afectadas.
alter table public.socios
  add constraint socios_auth_studio_unique unique (auth_user_id, studio_id);

comment on constraint socios_auth_studio_unique on public.socios is
  'P-6 (17ª auditoría): una persona (auth_user_id) tiene como mucho una ficha por estudio (studio_id) — cierra a nivel de servidor la carrera de doble clic en handleSignContract que el cerrojo de cliente por sí solo no cubre.';
