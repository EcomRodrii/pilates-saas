-- F-34 (auditoría 20ª pasada) — nota de procedencia: recuperada verbatim
-- desde `schema_migrations.statements` (mismo timestamp/nombre aplicado en
-- producción, fichero nunca llegó al repo). Ver
-- 20260821130703_cupo_semanal_ignora_clases_canceladas.sql para el método.
--
-- Grants vestigiales a anon/authenticated en dos tablas de medición interna
-- (sin uso real por esos roles — mismo patrón que
-- revoke_grants_vestigiales_authenticated).

revoke all on public.codigos_descuento_consumos from anon, authenticated;
revoke all on public.mensajes_entrantes_medicion from anon, authenticated;
