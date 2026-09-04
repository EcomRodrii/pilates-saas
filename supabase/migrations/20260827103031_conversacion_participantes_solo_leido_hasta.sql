-- I-16 (auditoría 29-ago-2026): esta migración YA está aplicada en
-- producción (aparece en `supabase_migrations.schema_migrations` con este
-- mismo nombre) pero no tenía fichero en git — otra sesión la aplicó
-- directamente con `apply_migration`/`execute_sql` sin dejar el fichero.
-- Sin él, un `supabase db push` desde limpio deja la tabla con el `grant
-- select, update on table public.conversacion_participantes to authenticated`
-- (tabla entera) de 20260825175436_community_messaging_os_rls.sql — ese
-- grant sobrevive a la policy `conversacion_participantes_marca_leido`
-- (acota FILAS por `auth_user_id = auth.uid()`, no COLUMNAS): con solo la
-- policy, una participante podría en teoría hacer UPDATE de cualquier
-- columna de su propia fila, no solo `leido_hasta` — coherente con el
-- comentario de esa migración ("Cada quien marca su propio progreso de
-- lectura"), que prometía justo esto.
--
-- Recaptura del estado REAL verificado en producción (information_schema.
-- column_privileges / role_table_grants) antes de escribir esto — no una
-- reconstrucción a ciegas: `authenticated` tiene SELECT/INSERT/DELETE a
-- nivel de TABLA (inertes: no hay policy de INSERT ni DELETE, mismo patrón
-- ya documentado en este repo — un GRANT sin policy es papel mojado bajo
-- RLS) y UPDATE únicamente en la columna `leido_hasta`.
revoke all on table public.conversacion_participantes from authenticated, anon;

grant select, insert, delete on table public.conversacion_participantes to authenticated;
grant update (leido_hasta) on table public.conversacion_participantes to authenticated;

grant all on table public.conversacion_participantes to service_role;
