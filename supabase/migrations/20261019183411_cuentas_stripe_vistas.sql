-- ═══════════════════════════════════════════════════════════════════════════
-- Vínculos del plan gratis (2a): la cuenta de Stripe, con memoria.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `studios.stripe_account_id` es único (uq_studios_stripe_account): para llevarse
-- la cuenta de Stripe a un estudio nuevo hay que desconectarla del viejo, y con
-- eso el rastro desaparecía. Se guarda cada cuenta que ha tenido un estudio y
-- `detectar_vinculos_gratis` busca ahí, no en la columna de hoy.

create table if not exists public.cuentas_stripe_vistas (
  stripe_account_id text not null,
  studio_id text not null references public.studios(id) on delete cascade,
  visto_en timestamptz not null default now(),
  primary key (stripe_account_id, studio_id)
);

alter table public.cuentas_stripe_vistas enable row level security;
create policy exige_doble_factor on public.cuentas_stripe_vistas as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
revoke all on public.cuentas_stripe_vistas from anon, authenticated;
grant all on public.cuentas_stripe_vistas to service_role;

