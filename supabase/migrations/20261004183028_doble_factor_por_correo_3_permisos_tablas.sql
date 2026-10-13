-- Segundo paso por correo, Las dos tablas, solo del servidor.
-- ⚠️ Esta migración se aplicó en producción en SEIS trozos (4-oct-2026), cada uno
-- con su versión y su nombre, y el repo la tenía en un solo fichero
-- (20261003160000_doble_factor_por_correo.sql). Supabase compara VERSIONES: con
-- el fichero único, «Supabase Preview» fallaba («Remote migration versions not
-- found in local migrations directory») y un `db push` la habría vuelto a
-- aplicar entera. Partida el 14-oct-2026 con el SQL EXACTO de cada trozo
-- (`supabase_migrations.schema_migrations.statements`, comprobado por md5).

revoke all on table public.codigos_correo_doble_factor from anon, authenticated;
revoke all on table public.doble_factor_correo_bloqueos from anon, authenticated;
