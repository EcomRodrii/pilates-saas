-- respaldo_sereno_studio1 es un backup puntual del theme builder, huérfano
-- (sin studio_id, sin caller en código, 1 fila). Tenía RLS desactivada y
-- authenticated con CRUD+TRUNCATE directo: cualquier usuario autenticado de
-- cualquier estudio podía leer/sobrescribir/truncarla vía PostgREST.
-- Mismo patrón deny-by-default que el resto de tablas internas del esquema:
-- RLS activa sin políticas, solo service_role/postgres (que hacen bypass de
-- RLS) pueden tocarla.

alter table public.respaldo_sereno_studio1 enable row level security;

revoke all on public.respaldo_sereno_studio1 from authenticated;
revoke all on public.respaldo_sereno_studio1 from anon;
