-- Segundo paso por correo, Los códigos y las cuentas a las que el correo no les vale hasta pasar la app.
-- ⚠️ Esta migración se aplicó en producción en SEIS trozos (4-oct-2026), cada uno
-- con su versión y su nombre, y el repo la tenía en un solo fichero
-- (20261003160000_doble_factor_por_correo.sql). Supabase compara VERSIONES: con
-- el fichero único, «Supabase Preview» fallaba («Remote migration versions not
-- found in local migrations directory») y un `db push` la habría vuelto a
-- aplicar entera. Partida el 14-oct-2026 con el SQL EXACTO de cada trozo
-- (`supabase_migrations.schema_migrations.statements`, comprobado por md5).

set local lock_timeout = '8s';
create table if not exists public.codigos_correo_doble_factor (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  codigo_hash text not null,
  intentos int not null default 0 check (intentos >= 0),
  enviado_en timestamptz not null default now(),
  caduca_en timestamptz not null,
  usado_en timestamptz
);
create index if not exists codigos_correo_doble_factor_usuario on public.codigos_correo_doble_factor (auth_user_id);
create table if not exists public.doble_factor_correo_bloqueos (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  desde timestamptz not null default now(),
  motivo text not null check (motivo in ('contrasena', 'correo'))
);
alter table public.codigos_correo_doble_factor enable row level security;
alter table public.doble_factor_correo_bloqueos enable row level security;
