-- Radar de ocupación: registro de avisos de WhatsApp enviados a socias cuando
-- una clase próxima tiene hueco (app/api/marketing/hueco/avisar). Tabla propia
-- en vez de reutilizar `automation_logs`: esa tabla exige EXACTAMENTE uno de
-- rule_id/automatizacion_id informado, con FK a filas reales de
-- automation_rules/automatizaciones (migración 0053) — crear una fila
-- sintética ahí la haría aparecer en la UI de Automatizaciones como una regla
-- que la propietaria no creó y no puede gestionar. Esto es solo dedup+auditoría
-- interna, sin RLS de cliente (mismo patrón que rate_limits/webhook_events:
-- RLS activo, sin policies — solo accesible con service role).
create table public.avisos_hueco (
  id text primary key,
  studio_id text not null references public.studios(id),
  sesion_id text not null,
  socio_id text not null,
  resultado text not null,
  detalle text,
  enviado_en timestamptz not null default now()
);

alter table public.avisos_hueco enable row level security;

-- Dedup: "¿ya avisé a esta socia de esta sesión en las últimas 24h?".
create index idx_avisos_hueco_dedup on public.avisos_hueco (sesion_id, socio_id, enviado_en);
