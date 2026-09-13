-- 20260913160100 · TENTARE — la cuenta de cobro del estudio (Stripe Connect y
-- datos SEPA) deja de ser escribible desde el navegador.
--
-- Auditoría RGPD/seguridad 2026-09-13 (anexo 02, H2).
--
-- `stripe_account_id` decide en qué cuenta caen los cobros de las socias
-- (checkout, POS, embebido, off-session), y `sepa_iban`/`sepa_acreedor_id`/
-- `sepa_titular` son la cuenta acreedora de la remesa. Hasta ahora estaban en
-- la lista blanca de UPDATE de `authenticated` (20260910171150), así que
-- cualquier sesión con rol PROPIETARIO podía cambiarlas, incluidas las fichas de
-- equipo con ese rol que no son la dueña del estudio.
--
-- Escritores legítimos después de esto, todos con service-role:
--   · Conectar Stripe → callback OAuth de Connect
--     (app/api/stripe/connect/callback, dbSetStripeAccountId). El `state` lo
--     emite /api/integrations/oauth-state, ahora solo para la dueña.
--   · Desconectar Stripe desde el panel → /api/integrations/stripe/desconectar.
--   · Desconexión desde el lado de Stripe → webhook account.application.deauthorized.
--   · Datos SEPA → /api/estudio/sepa.
--
-- Dos cerraduras:
--
-- 1) UPDATE: `authenticated` ya no tiene UPDATE de tabla sobre `studios` (se
--    revocó en 20260910171150 y se concedió por columnas), así que aquí el
--    REVOKE por columnas SÍ resta. Se incluyen también las columnas que ya no
--    estaban concedidas (`stripe_account_id_anterior`,
--    `stripe_account_desconectado_en`): no hacen nada hoy, pero dejan escrito
--    que no deben volver a la lista.
--
-- 2) INSERT: el alta de estudio (`dbCreateStudio`, /crear-estudio) es un INSERT
--    del propio cliente y el GRANT de INSERT es de TABLA — un REVOKE por
--    columnas sería un no-op. Mismo patrón que `trg_arrancar_prueba_gratuita`:
--    un trigger que ignora lo que llegue en esas columnas si la petición viene
--    de un usuario. El alta legítima no las manda nunca.
--
--    El mismo trigger, en UPDATE, rechaza el cambio si viene de un usuario: no
--    debería poder pasar con el REVOKE de (1), pero la lista blanca de columnas
--    ya se ha reescrito entera una vez y no queremos que una concesión futura
--    reabra esto sin que falle nada.
--
-- Columnas protegidas en el INSERT: además de las seis de arriba, las otras
-- referencias de Stripe que un estudio recién creado no puede traer de fábrica
-- (`stripe_customer_id`, `stripe_terminal_location_id`,
-- `stripe_terminal_reader_id`). Ninguna está en la lista blanca de UPDATE.

revoke update (
  stripe_account_id,
  stripe_account_id_anterior,
  stripe_account_desconectado_en,
  sepa_iban,
  sepa_acreedor_id,
  sepa_titular
) on public.studios from authenticated;

revoke update (
  stripe_account_id,
  stripe_account_id_anterior,
  stripe_account_desconectado_en,
  sepa_iban,
  sepa_acreedor_id,
  sepa_titular
) on public.studios from anon;

create or replace function public.studios_cuenta_cobro_solo_servidor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Service-role (callback de Connect, webhook, rutas de servidor): sin cambios.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.stripe_account_id              := null;
    new.stripe_account_id_anterior     := null;
    new.stripe_account_desconectado_en := null;
    new.sepa_iban                      := null;
    new.sepa_acreedor_id               := null;
    new.sepa_titular                   := null;
    new.stripe_customer_id             := null;
    new.stripe_terminal_location_id    := null;
    new.stripe_terminal_reader_id      := null;
    return new;
  end if;

  if new.stripe_account_id              is distinct from old.stripe_account_id
  or new.stripe_account_id_anterior     is distinct from old.stripe_account_id_anterior
  or new.stripe_account_desconectado_en is distinct from old.stripe_account_desconectado_en
  or new.sepa_iban                      is distinct from old.sepa_iban
  or new.sepa_acreedor_id               is distinct from old.sepa_acreedor_id
  or new.sepa_titular                   is distinct from old.sepa_titular then
    raise exception 'studios_cuenta_cobro_solo_servidor: la cuenta de cobro se cambia desde Configuración'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.studios_cuenta_cobro_solo_servidor() from public, anon, authenticated;
grant execute on function public.studios_cuenta_cobro_solo_servidor() to service_role;

-- Nombre elegido para disparar DESPUÉS de trg_arrancar_prueba_gratuita y
-- trg_heredar_plan_de_cadena (orden alfabético): no tocan estas columnas, pero
-- así lo último que se escribe en ellas es siempre este trigger.
drop trigger if exists trg_studios_cuenta_cobro_solo_servidor on public.studios;
create trigger trg_studios_cuenta_cobro_solo_servidor
  before insert or update on public.studios
  for each row execute function public.studios_cuenta_cobro_solo_servidor();

comment on function public.studios_cuenta_cobro_solo_servidor() is
  'Petición de usuario: INSERT ignora las columnas de cuenta de cobro; UPDATE que las cambie falla. Service-role sin cambios.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN tras aplicar (solo lectura):
--
-- select col,
--        has_column_privilege('authenticated', 'public.studios', col, 'UPDATE') as upd_authenticated, -- false x6
--        has_column_privilege('anon',          'public.studios', col, 'UPDATE') as upd_anon,          -- false x6
--        has_column_privilege('service_role',  'public.studios', col, 'UPDATE') as upd_service_role   -- true  x6
--   from unnest(array['stripe_account_id','stripe_account_id_anterior','stripe_account_desconectado_en',
--                     'sepa_iban','sepa_acreedor_id','sepa_titular']) as col;
--
-- -- El resto de la lista blanca del panel sigue intacta (75 columnas; eran 79):
-- select count(*) from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'studios'
--    and grantee = 'authenticated' and privilege_type = 'UPDATE';
--
-- select has_table_privilege('authenticated', 'public.studios', 'UPDATE');  -- false (sin UPDATE de tabla)
--
-- select t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t
--  where t.tgrelid = 'public.studios'::regclass and not t.tgisinternal order by 1;
--   → trg_arrancar_prueba_gratuita, trg_heredar_plan_de_cadena,
--     trg_studios_cuenta_cobro_solo_servidor
--
-- select has_function_privilege('authenticated', 'public.studios_cuenta_cobro_solo_servidor()', 'EXECUTE'); -- false
--
-- Pruebas de escritura: supabase/verificacion/rgpd-f2-escritura-staging.sql
-- (SOLO staging o rama, nunca producción).
-- ─────────────────────────────────────────────────────────────────────────────
