-- Recuperada del catálogo de producción (supabase_migrations.schema_migrations,
-- versión 20260817013957) durante la reconciliación del 17 ago 2026: estaba
-- aplicada en la BD y NO existía como fichero en ninguna rama del repo. Es la
-- pareja de 20260817013933_widget_eventos_socio_id_y_embudo, que sí está en main.
-- Contenido íntegro y literal, sin retoques.

-- pg_default_acl da EXECUTE directo a anon en funciones nuevas, sin pasar por
-- PUBLIC — REVOKE ... FROM PUBLIC no le quita nada (gotcha ya documentado
-- varias veces en .claude/tentare-os.md). Solo authenticated debe poder
-- llamar a estas dos (la RLS de widget_eventos_lectura ya exige
-- PROPIETARIO/MANAGER encima).
revoke all on function public.embudo_widget(date) from anon;
revoke all on function public.embudo_widget_por_dia(date) from anon;
