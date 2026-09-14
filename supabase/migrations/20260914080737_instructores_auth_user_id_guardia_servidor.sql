-- ─────────────────────────────────────────────────────────────────────────────
-- 60ª auditoría (14-sep-2026), H-3 — el gemelo que se quedó sin convertir
-- DENTRO del mismo fichero.
--
-- `20260913131042` creó dos triggers hermanos: `socios_auth_user_id_solo_
-- servidor` e `instructores_auth_user_id_solo_propio`. La migración de guardias
-- del 13-sep (`20260913233644`) convirtió el primero a `es_llamada_servicio()`
-- y no el segundo, porque su barrido buscaba el patrón `auth.uid() is null`
-- por regex sobre `prosrc` y aquí el uid se guardaba antes en una variable.
-- Peor: el bloque de verificación de aquella migración usaba EL MISMO regex,
-- así que validaba su propio punto ciego y terminó en verde.
--
-- «`auth.uid()` es nulo» no significa «viene del servidor»: significa «no hay
-- sesión». `es_llamada_servicio()` sí comprueba el rol de la petición.
--
-- Se conserva la semántica del nombre —una instructora sí puede vincular SU
-- cuenta, a diferencia de `socios`, donde solo el servidor—, verificada contra
-- producción con los tres controles (todo revertido):
--     service_role              → pasa el trigger (control positivo)
--     propietaria → uid AJENO   → 42501
--     propietaria → uid PROPIO  → OK
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.instructores_auth_user_id_solo_propio()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if public.es_llamada_servicio() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.auth_user_id is not null and new.auth_user_id <> auth.uid() then
      raise exception 'auth_user_id solo puede ser el de la propia sesión'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.auth_user_id is distinct from old.auth_user_id
     and new.auth_user_id is not null
     and new.auth_user_id <> auth.uid() then
    raise exception 'auth_user_id solo puede ser el de la propia sesión'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

do $$
begin
  if position('es_llamada_servicio' in (
        select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'instructores_auth_user_id_solo_propio')) = 0 then
    raise exception 'el trigger de instructores sigue sin la guardia de servidor';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'instructores' and not t.tgisinternal
                    and pg_get_triggerdef(t.oid) like '%instructores_auth_user_id_solo_propio%') then
    raise exception 'el trigger ya no está enganchado a instructores';
  end if;
end $$;

-- Decisión explícita sobre `anon` (guardián de contrato): es una función de
-- TRIGGER, no se invoca por RPC desde ninguna parte.
revoke all on function public.instructores_auth_user_id_solo_propio() from public, anon, authenticated;
