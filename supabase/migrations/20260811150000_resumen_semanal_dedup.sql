-- `enviarEmailResumenSemanal` (lib/emails/resumen-semanal-server.ts) no
-- tenía NINGÚN mecanismo de deduplicación — a diferencia de todo lo demás
-- que escribe a una socia/propietaria (que pasa por el Notification Engine
-- y su `dedup_key`), este iba directo a Resend sin comprobar si ya se
-- había enviado esta semana. Se detectó al verificar en vivo el piloto de
-- pg_cron (2026-08-11): invocar el endpoint dos veces la misma semana
-- mandaría el email dos veces de verdad. Esta tabla cierra el hueco con el
-- mismo patrón de compare-and-set que ya usa el resto del repo
-- (`confirmacion_pedida_en`, etc.): reclamar la fila ANTES de enviar, no
-- después.
create table if not exists resumen_semanal_envios (
  studio_id text not null references studios(id) on delete cascade,
  semana_lunes date not null,
  enviado_en timestamptz not null default now(),
  primary key (studio_id, semana_lunes)
);

alter table resumen_semanal_envios enable row level security;

-- Solo lo escribe/lee el cron vía service-role (bypasa RLS). Sin política
-- para authenticated/anon = deny by default, mismo criterio que el resto de
-- tablas internas del Decision OS que nunca se leen desde el cliente.
revoke all on resumen_semanal_envios from public, anon, authenticated;
