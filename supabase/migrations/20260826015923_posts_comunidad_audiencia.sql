-- Community & Messaging OS, P1 — "audiencia del Feed". Un post de comunidad
-- puede dirigirse a un segmento de socias en vez de a todo el estudio, y
-- puede llevar una imagen. Aditiva, no toca RLS existente
-- (admin_posts_comunidad, 0000_base.sql) ni ninguna fila actual: el DEFAULT
-- 'TODAS' deja todo post ya existente exactamente con el alcance que ya
-- tenía (todo el estudio).
--
-- El CHECK replica EXACTAMENTE el enum `DestinatariosCampana`
-- (lib/marketing/segmentos.ts / lib/types.ts) para que el Feed reutilice la
-- misma taxonomía de segmentos que ya usan las campañas de marketing, sin
-- inventar una paralela.
alter table public.posts_comunidad
  add column audiencia text not null default 'TODAS'
    check (audiencia in (
      'TODAS','ACTIVAS','INACTIVAS','SIN_PLAN','BONO','VIP',
      'BONO_CADUCA_PRONTO','PAGO_FALLIDO','CUMPLE_ESTE_MES'
    )),
  add column imagen_url text;
