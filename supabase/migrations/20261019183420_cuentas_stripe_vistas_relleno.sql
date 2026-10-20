-- Vínculos del plan gratis (2b): lo que ya había, al historial.
-- `apuntar_cuenta_stripe_vista` se creó para un trigger sobre `studios` que al
-- final NO se puso (la tabla estaba en uso por otras migraciones y el lock no
-- llegaba): la cuenta la apunta `detectar_vinculos_gratis` al medir
-- (20261019183716). Queda sin usar y solo la ejecuta service_role.

comment on table public.cuentas_stripe_vistas is
  'Cada cuenta de Stripe Connect que ha tenido un estudio (también las ya desconectadas). La rellena un trigger; la lee detectar_vinculos_gratis. Solo servidor.';

insert into public.cuentas_stripe_vistas (stripe_account_id, studio_id)
  select s.stripe_account_id, s.id from public.studios s where s.stripe_account_id is not null
  on conflict do nothing;

create or replace function public.apuntar_cuenta_stripe_vista()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.stripe_account_id is not null then
    insert into cuentas_stripe_vistas (stripe_account_id, studio_id)
      values (new.stripe_account_id, new.id)
      on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.apuntar_cuenta_stripe_vista() from public;
revoke execute on function public.apuntar_cuenta_stripe_vista() from anon;
revoke execute on function public.apuntar_cuenta_stripe_vista() from authenticated;
grant execute on function public.apuntar_cuenta_stripe_vista() to service_role;

