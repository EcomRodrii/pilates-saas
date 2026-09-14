-- Datos privados de la socia: el trigger que acota su escritura por rol, versionado.
--
-- `trg_socios_guarda_datos_privados` y `socios_guarda_datos_privados()` están
-- vivos en producción desde el cierre de la auditoría RGPD del 14-sep (se
-- aplicaron junto a `socios_datos_privados_cierre`), pero el fichero de esa
-- migración en el repo no los incluía: una base construida desde
-- `supabase/migrations/` se quedaba sin la única pieza que limita por rol
-- (`puede_ver_datos_privados_socia()`, PROPIETARIO/RECEPCION) lo que
-- `authenticated` escribe en NIF, dirección, fecha de nacimiento, firma y
-- métodos de pago.
--
-- El cuerpo es el de producción tal cual (`pg_get_functiondef` /
-- `pg_get_triggerdef`, 14-sep). Idempotente: sobre producción no cambia nada.
-- service_role y postgres pasan sin tocar (`auth.role()` fuera de
-- authenticated/anon), así que el servidor sigue escribiendo como siempre.

create or replace function public.socios_guarda_datos_privados()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.puede_ver_datos_privados_socia() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.nif is not null or new.direccion is not null or new.fecha_nacimiento is not null
       or new.tarjeta_marca is not null or new.tarjeta_ultimos4 is not null
       or new.tarjeta_exp_mes is not null or new.tarjeta_exp_anio is not null
       or new.stripe_customer_id is not null or new.stripe_payment_method_id is not null
       or new.sepa_mandate_id is not null or new.sepa_payment_method_id is not null
       or new.aceptacion_firma is not null then
      raise exception 'socios_guarda_datos_privados: solo PROPIETARIO y RECEPCION escriben estos datos de la socia'
        using errcode = '42501';
    end if;
  elsif new.nif is distinct from old.nif or new.direccion is distinct from old.direccion
     or new.fecha_nacimiento is distinct from old.fecha_nacimiento
     or new.tarjeta_marca is distinct from old.tarjeta_marca or new.tarjeta_ultimos4 is distinct from old.tarjeta_ultimos4
     or new.tarjeta_exp_mes is distinct from old.tarjeta_exp_mes or new.tarjeta_exp_anio is distinct from old.tarjeta_exp_anio
     or new.stripe_customer_id is distinct from old.stripe_customer_id or new.stripe_payment_method_id is distinct from old.stripe_payment_method_id
     or new.sepa_mandate_id is distinct from old.sepa_mandate_id or new.sepa_payment_method_id is distinct from old.sepa_payment_method_id
     or new.aceptacion_firma is distinct from old.aceptacion_firma then
    raise exception 'socios_guarda_datos_privados: solo PROPIETARIO y RECEPCION escriben estos datos de la socia'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- pg_default_acl da EXECUTE directo a anon/authenticated: revocar PUBLIC no basta.
revoke all on function public.socios_guarda_datos_privados() from public;
revoke all on function public.socios_guarda_datos_privados() from anon;
revoke all on function public.socios_guarda_datos_privados() from authenticated;
grant execute on function public.socios_guarda_datos_privados() to service_role;

drop trigger if exists trg_socios_guarda_datos_privados on public.socios;
create trigger trg_socios_guarda_datos_privados
  before insert or update of nif, direccion, fecha_nacimiento, tarjeta_marca, tarjeta_ultimos4, tarjeta_exp_mes, tarjeta_exp_anio, stripe_customer_id, stripe_payment_method_id, sepa_mandate_id, sepa_payment_method_id, aceptacion_firma
  on public.socios
  for each row execute function public.socios_guarda_datos_privados();

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.socios'::regclass
      and tgname = 'trg_socios_guarda_datos_privados'
      and tgenabled = 'O'
  ) then
    raise exception 'trg_socios_guarda_datos_privados no está activo en public.socios';
  end if;
  if has_function_privilege('anon', 'public.socios_guarda_datos_privados()', 'EXECUTE') then
    raise exception 'anon conserva EXECUTE sobre socios_guarda_datos_privados()';
  end if;
  if has_function_privilege('authenticated', 'public.socios_guarda_datos_privados()', 'EXECUTE') then
    raise exception 'authenticated conserva EXECUTE sobre socios_guarda_datos_privados()';
  end if;
  if not has_function_privilege('service_role', 'public.socios_guarda_datos_privados()', 'EXECUTE') then
    raise exception 'service_role ha perdido EXECUTE sobre socios_guarda_datos_privados()';
  end if;
end $$;
