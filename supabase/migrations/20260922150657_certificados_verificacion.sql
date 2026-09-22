-- Certificación «Tentare Verified Studio»: un certificado oficial por estudio,
-- con un código único público (TNT-VS-<año>-<NNNN>) verificable en /verify/<id>
-- sin sesión.
--
-- Generación y revocación: SIEMPRE con service-role, desde el endpoint que ya
-- comprueba `puedeGestionarSede()` en TS antes de llamar a la RPC de abajo
-- (mismo criterio que /api/cierres — la RPC corre con auth.uid() NULL, así que
-- una guardia ahí quedaría bypaseada en silencio). No hay policy de
-- insert/update para `authenticated`: nadie del cliente puede crear ni tocar un
-- certificado directamente.
--
-- Lectura pública (`/verify/<id>`): tampoco hay policy `anon` — la página lee
-- con getSupabaseAdmin() en servidor (mismo patrón que
-- app/confirmar-reserva/[token]/page.tsx), así que no hace falta abrir RLS a
-- todo el mundo para un solo lookup por id.

create table if not exists public.certificados_estudio (
  id text primary key,                        -- TNT-VS-2026-0001
  studio_id text not null references public.studios(id) on delete cascade,
  estado text not null default 'ACTIVE' check (estado in ('ACTIVE', 'REVOKED')),
  emitido_en timestamptz not null default now(),
  revocado_en timestamptz,
  creado_por text                              -- auth_user_id de quien lo generó, informativo
);

-- Un estudio nunca tiene dos certificados ACTIVOS a la vez (idempotencia:
-- generar de nuevo con uno ya activo devuelve el existente, no crea otro).
create unique index if not exists certificados_estudio_studio_activo_uk
  on public.certificados_estudio (studio_id)
  where estado = 'ACTIVE';

create index if not exists certificados_estudio_studio_id_idx
  on public.certificados_estudio (studio_id);

alter table public.certificados_estudio enable row level security;

drop policy if exists certificados_estudio_lectura on public.certificados_estudio;
create policy certificados_estudio_lectura on public.certificados_estudio
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_sede());

-- Secuencia del correlativo del código. No hace falta el aparato de
-- reservar_numero_factura (lock + reintento): eso existe por la cadena de
-- huellas Veri*Factu, que no aplica aquí — un simple nextval() dentro de la
-- RPC ya evita colisiones entre llamadas concurrentes.
create sequence if not exists public.certificados_estudio_codigo_seq;

-- crear_certificado_estudio(): idempotente — si el estudio ya tiene un
-- certificado ACTIVE, lo devuelve tal cual en vez de crear otro. SECURITY
-- DEFINER porque la llama service-role (auth.uid() NULL); el rol ya se
-- comprobó en TS antes de llegar aquí.
create or replace function public.crear_certificado_estudio(p_studio_id text)
returns public.certificados_estudio
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existente public.certificados_estudio;
  v_codigo text;
  v_fila public.certificados_estudio;
begin
  select * into v_existente
    from public.certificados_estudio
   where studio_id = p_studio_id and estado = 'ACTIVE'
   limit 1;
  if found then
    return v_existente;
  end if;

  v_codigo := 'TNT-VS-' || to_char(now(), 'YYYY') || '-'
    || lpad(nextval('public.certificados_estudio_codigo_seq')::text, 4, '0');

  insert into public.certificados_estudio (id, studio_id, estado)
  values (v_codigo, p_studio_id, 'ACTIVE')
  returning * into v_fila;

  return v_fila;
end;
$$;

comment on function public.crear_certificado_estudio(text) is
  'Genera (o devuelve el ya activo) el certificado Tentare Verified Studio de un estudio. Solo service_role — el rol se comprueba en el endpoint, no aquí (auth.uid() es NULL bajo service-role).';

revoke all on function public.crear_certificado_estudio(text) from public, anon, authenticated;
grant execute on function public.crear_certificado_estudio(text) to service_role;

-- revocar_certificado_estudio(): pone REVOKED el certificado ACTIVE de un
-- estudio. Devuelve la fila actualizada, o null si no había ninguno activo
-- (idempotente: revocar dos veces no es un error).
create or replace function public.revocar_certificado_estudio(p_studio_id text)
returns public.certificados_estudio
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila public.certificados_estudio;
begin
  update public.certificados_estudio
     set estado = 'REVOKED', revocado_en = now()
   where studio_id = p_studio_id and estado = 'ACTIVE'
  returning * into v_fila;

  return v_fila;
end;
$$;

comment on function public.revocar_certificado_estudio(text) is
  'Revoca el certificado ACTIVE de un estudio, si lo hay. Solo service_role.';

revoke all on function public.revocar_certificado_estudio(text) from public, anon, authenticated;
grant execute on function public.revocar_certificado_estudio(text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN tras aplicar:
--
-- select r, has_function_privilege(r, 'public.crear_certificado_estudio(text)', 'EXECUTE') as crear,
--           has_function_privilege(r, 'public.revocar_certificado_estudio(text)', 'EXECUTE') as revocar
--   from unnest(array['anon', 'authenticated', 'service_role']) as r;
--   → anon: false/false · authenticated: false/false · service_role: true/true
--
-- select policyname, cmd from pg_policies where tablename = 'certificados_estudio';
--   → solo certificados_estudio_lectura (SELECT)
--
-- begin;
--   select public.crear_certificado_estudio('<studio_id_de_pruebas>');   -- TNT-VS-2026-0001
--   select public.crear_certificado_estudio('<studio_id_de_pruebas>');   -- misma fila, mismo id (idempotente)
--   select public.revocar_certificado_estudio('<studio_id_de_pruebas>'); -- estado REVOKED
--   select public.revocar_certificado_estudio('<studio_id_de_pruebas>'); -- null, no error (ya no había activo)
-- rollback;
-- ─────────────────────────────────────────────────────────────────────────────
