-- C-6 (auditoría 19-ago): el camino de EMAIL de los recordatorios ya está
-- protegido con idempotencyKey (Resend dedupe server-side, ver
-- lib/db/supabase-data-admin.ts:1297). El camino de WHATSAPP no tenía
-- NINGUNA marca de "ya enviado": si procesarRecordatoriosEstudio
-- (lib/inngest/recordatorios.ts) falla DESPUÉS de haber mandado varios
-- WhatsApp, Inngest reejecuta el step.run('enviar', ...) completo desde el
-- principio (retries: 3) y las socias ya avisadas reciben otro mensaje —
-- hasta 4 por clase. Esto quema la reputación del número de WhatsApp
-- Business del estudio en Meta, compartido entre TODOS los estudios.
--
-- Solo cubre WHATSAPP a propósito: EMAIL ya tiene su propio mecanismo de
-- dedupe (idempotencyKey de Resend) — duplicarlo aquí sería doble
-- contabilidad sin cerrar ningún hueco real.
--
-- Mismo patrón compare-and-set que resumen_semanal_envios (20260811150000):
-- reclamar la fila ANTES de enviar, no después. Sin purga automática — el
-- volumen (una fila por socia/sesión/día con WhatsApp activo) es trivial
-- frente a la cuota de Supabase (ver memoria "consumo-vercel-supabase"); si
-- algún día hiciera falta, purgar a mano como ya documenta webhook_events:
--   delete from public.recordatorio_envios where enviado_en < now() - interval '90 days';
create table if not exists recordatorio_envios (
  sesion_id text not null references public.sesiones(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  canal text not null default 'WHATSAPP',
  enviado_en timestamptz not null default now(),
  primary key (sesion_id, socio_id, canal)
);

alter table recordatorio_envios enable row level security;

-- Solo lo escribe/lee el worker de Inngest vía service-role (bypasa RLS).
-- Sin política para authenticated/anon = deny by default, mismo criterio
-- que resumen_semanal_envios y el resto de tablas internas de envíos.
revoke all on recordatorio_envios from public, anon, authenticated;
