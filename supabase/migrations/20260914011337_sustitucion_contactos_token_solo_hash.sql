-- 20260914011337 · TENTARE — el enlace de «aceptar sustitución» deja de
-- guardarse en claro, y el personal deja de leer la traza de contactos directo.
--
-- Auditoría RGPD/seguridad 2026-09-13 (anexo 02, M3; control C05).
--
-- `sustitucion_contactos.token` guardaba el MISMO token firmado que va en el
-- email a la candidata, y la política `admin_sustitucion_contactos` (ALL, todo
-- el estudio) dejaba leerlo a INSTRUCTOR y RECEPCIÓN: se podía aceptar o
-- rechazar una sustitución en nombre de una compañera.
--
-- 1) Solo hash. `token_hash` = SHA-256 hex del token (sin pepper: el token es un
--    HMAC, no hay nada que adivinar; paridad con TS en lib/token-hash.test.ts).
--    Los enlaces ya enviados siguen valiendo hasta su caducidad (3 h): la ruta
--    pública verifica la firma igual que antes y localiza el contacto por el
--    hash del token que llega.
--
-- 2) Un trigger hashea cualquier `token` que llegue en claro y lo vacía. Cubre
--    el build anterior a mitad de despliegue (sigue insertando `token`) y
--    cualquier escritura futura que se olvide del hash.
--
-- 3) Fuera del cliente. Nadie la lee con la sesión del navegador: el panel
--    recibe la traza por /api/sustituciones (service-role), y el resto de
--    lectores y escritores son rutas de servidor, crons y `rankear_candidatas`
--    (SECURITY INVOKER, solo llamada con service-role). Los grants eran de
--    TABLA a anon y authenticated, así que un REVOKE por columna no restaba:
--    se revoca todo y se retira la política, igual que 0057.

alter table public.sustitucion_contactos add column if not exists token_hash text;

update public.sustitucion_contactos
   set token_hash = encode(extensions.digest(token, 'sha256'), 'hex'),
       token = null
 where token is not null;

drop index if exists public.idx_contactos_token;
create index if not exists idx_contactos_token_hash
  on public.sustitucion_contactos (token_hash) where token_hash is not null;

create or replace function public.sustitucion_contactos_token_solo_hash()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.token is not null then
    new.token_hash := encode(extensions.digest(new.token, 'sha256'), 'hex');
    new.token := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.sustitucion_contactos_token_solo_hash() from public, anon, authenticated;
grant execute on function public.sustitucion_contactos_token_solo_hash() to service_role;

drop trigger if exists trg_sustitucion_contactos_token_solo_hash on public.sustitucion_contactos;
create trigger trg_sustitucion_contactos_token_solo_hash
  before insert or update of token on public.sustitucion_contactos
  for each row execute function public.sustitucion_contactos_token_solo_hash();

drop policy if exists admin_sustitucion_contactos on public.sustitucion_contactos;
revoke all on public.sustitucion_contactos from anon, authenticated;
grant select, insert, update, delete on public.sustitucion_contactos to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN tras aplicar (solo lectura):
--
-- select count(*) filter (where token is not null)      as en_claro,   -- 0
--        count(*) filter (where token_hash is not null) as con_hash    -- = tokens que había (7 el 14-sep)
--   from public.sustitucion_contactos;
-- select has_table_privilege('authenticated', 'public.sustitucion_contactos', 'SELECT'), -- false
--        has_table_privilege('anon',          'public.sustitucion_contactos', 'SELECT'), -- false
--        has_table_privilege('service_role',  'public.sustitucion_contactos', 'SELECT'); -- true
-- select has_function_privilege('authenticated', 'public.sustitucion_contactos_token_solo_hash()', 'EXECUTE'); -- false
-- ─────────────────────────────────────────────────────────────────────────────
