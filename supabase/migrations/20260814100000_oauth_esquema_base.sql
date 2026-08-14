-- OAuth 2.0 para aplicaciones de terceros (Zapier es la primera) — Fase 0.
--
-- Tentare ya era CLIENTE OAuth de terceros (Stripe Connect, Google, Zoom,
-- Klaviyo — ver lib/oauth-state.ts). Esto es la dirección contraria: Tentare
-- pasa a ser SERVIDOR OAuth para que apps externas (Zapier) puedan actuar en
-- nombre de un estudio, con consentimiento explícito y aislamiento estricto
-- por studio_id.
--
-- Mismo patrón que integracion_credenciales: RLS activada, CERO políticas.
-- `anon`/`authenticated` no tienen ninguna vía de acceso — solo el
-- service-role (getSupabaseAdmin()) puede leer/escribir estas tablas, y CADA
-- query en código de servidor filtra manualmente por studio_id/cliente_id
-- (igual que ya documenta lib/auth-server.ts: bajo service-role, RLS no
-- ayuda, current_studio_id()/auth.uid() son NULL).

create table public.oauth_clientes (
  id                  text primary key,               -- slug estable, p.ej. 'zapier' (no uuid random)
  nombre              text not null,
  descripcion         text,
  client_secret_hash  text not null,                   -- sha256(secret) en hex; el secret NUNCA se guarda en claro
  redirect_uris       text[] not null,                  -- whitelist estricta, comparación exacta (sin prefijo/wildcard)
  es_confidencial     boolean not null default true,
  logo_url            text,
  activo              boolean not null default true,
  creado_en           timestamptz not null default now()
);

create table public.oauth_consentimientos (
  id            text primary key,
  studio_id     text not null references public.studios(id) on delete cascade,
  cliente_id    text not null references public.oauth_clientes(id) on delete cascade,
  otorgado_por  uuid not null,                          -- auth_user_id de quien autorizó (PROPIETARIO/MANAGER)
  scopes        text[] not null,
  otorgado_en   timestamptz not null default now(),
  revocado_en   timestamptz,
  unique (studio_id, cliente_id)
);

-- Un solo uso, TTL corto. `usado_en` NO se borra al canjear — se marca, para
-- poder detectar el reuse (RFC 6749 §10.5) y revocar toda la cadena de
-- tokens nacida de este código si alguien lo reintenta.
create table public.oauth_codigos_autorizacion (
  codigo                  text primary key,
  studio_id               text not null references public.studios(id) on delete cascade,
  cliente_id              text not null references public.oauth_clientes(id) on delete cascade,
  auth_user_id            uuid not null,
  scopes                  text[] not null,
  redirect_uri            text not null,                -- debe coincidir EXACTO en /api/oauth/token
  code_challenge          text not null,                 -- PKCE obligatorio siempre (ver docs/oauth-arquitectura.md)
  code_challenge_method   text not null default 'S256',
  cadena_id               text not null,                 -- id de la futura familia de tokens (para revocar en reuse)
  expira_en               timestamptz not null,
  usado_en                timestamptz,
  creado_en               timestamptz not null default now()
);

-- Access + refresh token viven en la MISMA fila (un par), encadenados por
-- cadena_id. Rotar = marcar la fila vieja revocada y crear una fila nueva
-- con el mismo cadena_id; si se reutiliza un token ya revocado, se revoca
-- toda la cadena.
create table public.oauth_tokens (
  id                        text primary key,
  studio_id                 text not null references public.studios(id) on delete cascade,
  cliente_id                text not null references public.oauth_clientes(id) on delete cascade,
  auth_user_id              uuid not null,
  scopes                    text[] not null,
  access_token_hash         text not null,
  refresh_token_hash        text not null,
  access_token_expira_en    timestamptz not null,
  refresh_token_expira_en   timestamptz not null,
  cadena_id                 text not null,
  revocado_en               timestamptz,
  reemplazado_por           text references public.oauth_tokens(id),
  creado_en                 timestamptz not null default now()
);

create index idx_oauth_tokens_studio on public.oauth_tokens(studio_id);
create index idx_oauth_tokens_cadena on public.oauth_tokens(cadena_id);
create unique index idx_oauth_tokens_access_hash on public.oauth_tokens(access_token_hash);
create unique index idx_oauth_tokens_refresh_hash on public.oauth_tokens(refresh_token_hash);

create table public.oauth_auditoria_accesos (
  id           bigint generated always as identity primary key,
  token_id     text references public.oauth_tokens(id) on delete set null,
  studio_id    text not null,
  cliente_id   text not null,
  scope_usado  text,
  metodo       text not null,
  ruta         text not null,
  status_code  integer not null,
  ip           text,
  creado_en    timestamptz not null default now()
);

create index idx_oauth_auditoria_studio on public.oauth_auditoria_accesos(studio_id, creado_en desc);

alter table public.oauth_clientes enable row level security;
alter table public.oauth_consentimientos enable row level security;
alter table public.oauth_codigos_autorizacion enable row level security;
alter table public.oauth_tokens enable row level security;
alter table public.oauth_auditoria_accesos enable row level security;

-- Sin CREATE POLICY a propósito: RLS activada + cero políticas deniega por
-- defecto a anon/authenticated (solo service_role bypasea RLS). No son
-- tablas que el cliente del panel toque nunca directo.
revoke all on public.oauth_clientes from anon, authenticated;
revoke all on public.oauth_consentimientos from anon, authenticated;
revoke all on public.oauth_codigos_autorizacion from anon, authenticated;
revoke all on public.oauth_tokens from anon, authenticated;
revoke all on public.oauth_auditoria_accesos from anon, authenticated;
grant all on public.oauth_clientes to service_role;
grant all on public.oauth_consentimientos to service_role;
grant all on public.oauth_codigos_autorizacion to service_role;
grant all on public.oauth_tokens to service_role;
grant all on public.oauth_auditoria_accesos to service_role;
