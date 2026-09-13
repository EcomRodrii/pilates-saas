-- 20260913160000 · TENTARE — `auth_user_id` de instructores y socios: desde una
-- petición de usuario solo se vincula la propia cuenta (instructores) o nada
-- (socios). Vincular la cuenta de OTRA persona es trabajo del servidor.
--
-- Auditoría RGPD/seguridad 2026-09-13 (anexo 02, H1).
--
-- Por qué importa la columna: `current_studio_id()` (2º brazo) y
-- `resolverSesionStaff` (lib/auth-server.ts) deciden en qué estudio opera una
-- cuenta a partir de sus filas de `instructores`. Una fila con el
-- `auth_user_id` de alguien es, a efectos prácticos, meter a esa persona en un
-- estudio. En `socios`, el `auth_user_id` es lo que autoriza el portal de la
-- alumna (`fetchPublicStudioData`), con sus reservas, bonos y tarjeta guardada.
--
-- Las políticas RLS (`owner_write_instructores`, `manager_gestiona_equipo`,
-- `socios_escritura_*`) solo deciden QUÉ FILA del estudio se toca, no qué valor
-- lleva esta columna. Y el GRANT de INSERT/UPDATE es de TABLA, así que un
-- REVOKE de columna no restaría nada (ver 20260910171150). Por eso un trigger.
--
-- Criterio: se distingue por `auth.uid()`.
--   · Service-role, pg_cron, triggers de auth: `auth.uid()` es NULL → sin
--     cambios. Es por donde pasan TODOS los vínculos legítimos con otra
--     cuenta: alta de equipo y alta cross-sede de cadena
--     (lib/actions/equipo/equipoAction.ts), aceptar la invitación
--     (equipoReclamarAction.ts), el alta desde Network
--     (app/api/network/formalizacion), el claim de la socia por email
--     verificado (lib/db/supabase-data-admin.ts, resolverSociaAutenticada) y
--     el alta de socia desde el portal/checkout.
--   · Petición de usuario (JWT con `sub`):
--       instructores → el valor nuevo solo puede ser NULL o la propia cuenta.
--         Lo usa `dbInsertInstructoraPropia` (lib/supabase-data.ts), que
--         inserta la ficha de la propia freelance.
--       socios → el valor nuevo solo puede ser NULL. El panel solo lo pone a
--         NULL (`dbUpdateSocio`, al cambiar el email) y no hay ningún flujo de
--         cliente que vincule una alumna: ni siquiera con la propia cuenta,
--         porque eso daría a quien lo haga el portal de esa alumna.
--   · Si la columna no cambia (el panel reenvía la ficha entera), no se mira.
--
-- Convive con `trg_self_claim_no_escala` (BEFORE UPDATE, que congela rol y
-- estudio al vincular una ficha sin cuenta): este trigger solo valida y no
-- modifica NEW, así que el orden entre ambos no altera el resultado.

create or replace function public.instructores_auth_user_id_solo_propio()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return new;
  end if;

  if new.auth_user_id is null or new.auth_user_id = v_uid then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.auth_user_id is not distinct from old.auth_user_id then
    return new;
  end if;

  raise exception 'instructores_auth_user_id_ajeno: una cuenta de otra persona solo se vincula por invitación'
    using errcode = '42501',
          hint = 'La invitación de Equipo envía el enlace para que la propia persona lo acepte.';
end;
$$;

create or replace function public.socios_auth_user_id_solo_servidor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.auth_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.auth_user_id is not distinct from old.auth_user_id then
    return new;
  end if;

  raise exception 'socios_auth_user_id_solo_servidor: la cuenta de una alumna se vincula al iniciar sesión ella misma'
    using errcode = '42501';
end;
$$;

-- Funciones de trigger: nadie las llama como RPC. Mismo criterio que el resto
-- del catálogo (pg_default_acl las concede directo a anon/authenticated).
revoke execute on function public.instructores_auth_user_id_solo_propio() from public, anon, authenticated;
revoke execute on function public.socios_auth_user_id_solo_servidor() from public, anon, authenticated;
grant execute on function public.instructores_auth_user_id_solo_propio() to service_role;
grant execute on function public.socios_auth_user_id_solo_servidor() to service_role;

drop trigger if exists trg_instructores_auth_user_id_solo_propio on public.instructores;
create trigger trg_instructores_auth_user_id_solo_propio
  before insert or update of auth_user_id on public.instructores
  for each row execute function public.instructores_auth_user_id_solo_propio();

drop trigger if exists trg_socios_auth_user_id_solo_servidor on public.socios;
create trigger trg_socios_auth_user_id_solo_servidor
  before insert or update of auth_user_id on public.socios
  for each row execute function public.socios_auth_user_id_solo_servidor();

comment on function public.instructores_auth_user_id_solo_propio() is
  'Petición de usuario: instructores.auth_user_id solo NULL o la propia cuenta. Service-role sin cambios.';
comment on function public.socios_auth_user_id_solo_servidor() is
  'Petición de usuario: socios.auth_user_id solo NULL. El vínculo lo hace el servidor.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN tras aplicar (solo lectura):
--
-- select c.relname, t.tgname, pg_get_triggerdef(t.oid)
--   from pg_trigger t join pg_class c on c.oid = t.tgrelid
--  where c.relname in ('instructores', 'socios') and not t.tgisinternal
--  order by 1, 2;
--   → trg_instructores_auth_user_id_solo_propio y trg_self_claim_no_escala en
--     instructores; trg_socios_auth_user_id_solo_servidor en socios.
--
-- select p.proname,
--        p.prosecdef                                           as security_definer,  -- false
--        p.proconfig                                           as config,            -- {search_path=""}
--        has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,          -- false
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated, -- false
--        has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role   -- true
--   from pg_proc p
--  where p.pronamespace = 'public'::regnamespace
--    and p.proname in ('instructores_auth_user_id_solo_propio', 'socios_auth_user_id_solo_servidor');
--
-- Pruebas de escritura: supabase/verificacion/rgpd-f2-escritura-staging.sql
-- (SOLO staging o rama, nunca producción).
-- ─────────────────────────────────────────────────────────────────────────────
