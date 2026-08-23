-- Auditoría 22-ago — cerrar por permisos lo que hoy solo cierra un NULL.
--
-- Estado verificado en producción el 22/23-ago: ~50 tablas de `public` (socios,
-- reservas, recibos, facturas, notas_internas, memoria_socio, integraciones…)
-- conceden a `anon` y `authenticated` el paquete entero:
-- SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER.
--
-- Hoy no es explotable: para `anon`, `current_studio_id()` devuelve NULL y
-- `studio_id = NULL` nunca es cierto, así que las policies emitidas `to
-- public` no le dejan ver nada. Pero el aislamiento depende de que ese NULL se
-- mantenga, no de un permiso — y ya hubo una fuga de PII (14-ago) que nació
-- justo en este terreno.
--
-- Nada de esto toca ninguna policy: para el código que hoy funciona no cambia
-- absolutamente nada. PostgREST no usa jamás TRUNCATE, TRIGGER ni REFERENCES,
-- y Storage/Realtime viven en sus propios esquemas. Verificado en vivo antes
-- de aplicar (execute_sql + ROLLBACK): las 151 tablas de `public` son de
-- `postgres`, y ningún camino de código lee `integraciones` como `anon`
-- (los tres consumidores usan getSupabaseAdmin(), que ignora los GRANT).

-- 1. El revoke sobre lo que YA existe.
--
-- `revoke ... on all tables in schema public` exige ser propietario de cada
-- tabla y aborta entero si una es de otro rol (p. ej. creada por una
-- extensión). Por eso el bucle: salta lo que no nos pertenece en vez de
-- tumbarlo todo.
do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename
      from pg_tables
     where schemaname = 'public'
       and tableowner = current_user
  loop
    execute format(
      'revoke truncate, trigger, references on table %I.%I from anon, authenticated',
      t.schemaname, t.tablename
    );
  end loop;
end
$$;

-- 2. Y sobre lo que se cree A PARTIR DE AHORA.
--
-- Sin esto el punto 1 es una foto fija: el default del proyecto vuelve a
-- conceder los tres privilegios a cada tabla nueva (es justo lo que documenta
-- 20260821145056, que tuvo que revocarlos a mano para `menu_novedades`), así
-- que la primera migración posterior reabriría el agujero. `for role postgres`
-- porque es el rol con el que corren las migraciones y, por tanto, el
-- propietario de las tablas nuevas.
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- 3. `integraciones` deja de estar concedida a `anon`.
--
-- Guarda las claves API de terceros EN CLARO (Mailchimp, Kisi, WhatsApp). Lo
-- único que hoy frena a `anon` es que su única policy sea `to authenticated`;
-- una sola policy futura emitida `to public` expondría las claves de todos los
-- estudios. Comprobado que ningún camino de la app lee esta tabla como `anon`:
-- todos van con service-role (lib/db/supabase-data-admin.ts,
-- lib/emails/plantillas-server.ts, lib/integraciones/registrar-salud.ts).
revoke all on table public.integraciones from anon;
