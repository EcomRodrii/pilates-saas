-- Centro de Ayuda (/ayuda): valoración "¿Te ha ayudado este artículo?" al pie
-- de cada artículo (😞/😐/😃). Tabla de solo-servidor: se escribe desde
-- app/api/ayuda/feedback (rate-limitado, service role) y se lee desde
-- app/api/interno/ayuda-feedback (permiso content.write), nunca directo desde
-- el cliente con la clave anon — un visitante público no autenticado no tiene
-- ninguna sesión de estudio ni de Tentare a la que atar la fila, así que el
-- patrón de `soporte_solicitudes` (insert directo del cliente con
-- studio_id = sesión) no aplica aquí.
--
-- RLS activa sin ninguna política: deniega todo a anon/authenticated por
-- construcción; el service role (usado por las dos rutas de arriba) la
-- salta siempre. Los REVOKE explícitos son defensa en profundidad, mismo
-- criterio que el resto del repo (ver tentare-os.md, "pg_default_acl no
-- basta con REVOKE FROM PUBLIC").
create table if not exists ayuda_feedback (
  id uuid primary key default gen_random_uuid(),
  articulo_slug text not null,
  categoria_slug text not null,
  valoracion text not null check (valoracion in ('MALO', 'REGULAR', 'BUENO')),
  url text not null,
  creado_en timestamptz not null default now()
);

create index if not exists ayuda_feedback_articulo_idx on ayuda_feedback (articulo_slug, creado_en desc);

alter table ayuda_feedback enable row level security;

revoke all on ayuda_feedback from anon;
revoke all on ayuda_feedback from authenticated;
grant all on ayuda_feedback to service_role;
