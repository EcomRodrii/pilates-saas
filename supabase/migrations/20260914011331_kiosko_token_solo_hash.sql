-- 20260914011331 · TENTARE — el token del kiosko deja de guardarse en claro.
--
-- Auditoría RGPD/seguridad 2026-09-13 (anexo 05, A-11; control C03).
--
-- `studios.kiosk_token` es la llave de /api/public/checkin: con ella se marcan
-- asistencias y se otorgan créditos canjeables. Estaba en claro y la leía todo
-- el personal (también INSTRUCTOR) por la política `own_studio_read`.
--
-- Por qué una TABLA APARTE y no `REVOKE SELECT (kiosk_token)` ni una columna
-- `kiosk_token_hash` en `studios`: `authenticated` tiene SELECT de TABLA sobre
-- `studios` (verificado en information_schema.role_table_grants), así que un
-- REVOKE por columnas no resta nada, y una columna nueva también la cubriría ese
-- mismo grant. Convertir el SELECT de `studios` a lista de columnas rompe todo
-- `select('*')` del panel. `kiosko_tokens` va con RLS y SIN ningún grant a
-- anon/authenticated: solo la lee y escribe el service-role
-- (/api/kiosk/token y validarKioskToken). Mismo patrón que
-- `instructor_enlaces_vigentes` (0057).
--
-- Hash: SHA-256 hex sin pepper — el token son 24 bytes aleatorios, no hay
-- fuerza bruta que frenar, y así los existentes se hashean aquí en SQL sin meter
-- ningún secreto en el repo. Paridad con TS en lib/token-hash.test.ts.
--
-- Los kioskos ya configurados siguen funcionando: su token (guardado en el
-- dispositivo) se compara contra el hash de ese mismo token.

create table if not exists public.kiosko_tokens (
  studio_id      text primary key references public.studios(id) on delete cascade,
  token_hash     text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  actualizado_en timestamptz not null default now()
);

comment on table public.kiosko_tokens is
  'SHA-256 del token de dispositivo del kiosko por estudio. Solo service-role; el token en claro se muestra una vez al generarlo.';

alter table public.kiosko_tokens enable row level security;

-- pg_default_acl concede ALL en tablas nuevas a anon/authenticated: se quita
-- explícitamente.
revoke all on public.kiosko_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.kiosko_tokens to service_role;

-- Tokens existentes → hash.
insert into public.kiosko_tokens (studio_id, token_hash)
select id, encode(extensions.digest(kiosk_token, 'sha256'), 'hex')
  from public.studios
 where kiosk_token is not null and kiosk_token <> ''
on conflict (studio_id) do update
  set token_hash = excluded.token_hash, actualizado_en = now();

-- Y el claro fuera. La columna se queda (vacía) para no romper un build anterior
-- a mitad de despliegue: leería NULL y el check-in fallaría cerrado.
update public.studios set kiosk_token = null where kiosk_token is not null;

-- Nunca más en claro: cualquier escritura (código viejo, INSERT del alta desde
-- el cliente, restauración) falla en vez de guardar la llave legible.
alter table public.studios drop constraint if exists studios_kiosk_token_nunca_en_claro;
alter table public.studios
  add constraint studios_kiosk_token_nunca_en_claro check (kiosk_token is null);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN tras aplicar (solo lectura):
--
-- select count(*) from public.studios where kiosk_token is not null;            -- 0
-- select count(*) from public.kiosko_tokens;                                     -- = estudios que tenían token (1 el 14-sep)
-- select has_table_privilege('authenticated', 'public.kiosko_tokens', 'SELECT'), -- false
--        has_table_privilege('anon',          'public.kiosko_tokens', 'SELECT'), -- false
--        has_table_privilege('service_role',  'public.kiosko_tokens', 'SELECT'); -- true
-- ─────────────────────────────────────────────────────────────────────────────
