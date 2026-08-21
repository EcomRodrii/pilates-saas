-- 🟡 Auditoría 21-ago — las dos tablas nuevas del 20-ago activaron RLS pero no
-- revocaron los GRANT por defecto de Supabase.
--
-- Comprobado en producción:
--   has_table_privilege('authenticated','codigos_descuento_consumos','INSERT') = true
--   has_table_privilege('authenticated','mensajes_entrantes_medicion','INSERT') = true
--
-- Hoy no hay fuga —RLS activa y CERO policies deniega todo a anon/authenticated—
-- pero es justo la segunda barrera que 0094_revoke_grants_deny_by_default.sql
-- estableció como criterio del proyecto: si mañana alguien añade una policy
-- permisiva por error, el GRANT deja pasar. Las dos migraciones lo invocan en
-- un comentario y ninguna lo ejecuta.
revoke all on public.codigos_descuento_consumos from anon, authenticated;
revoke all on public.mensajes_entrantes_medicion from anon, authenticated;
