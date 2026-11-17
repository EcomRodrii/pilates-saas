-- Visitas de una propietaria a la pantalla de elegir plan (Fase 5 de Billing & Revenue, 17-nov-2026).
--
-- «Un estudio ha visitado repetidamente la página de precios sin terminar la contratación» es una
-- señal que no se podía saber: la página pública /precios es anónima y de /suscripcion no quedaba
-- rastro. Esto apunta, como mucho UNA fila por estudio y día, que la propietaria de un estudio que
-- aún no paga ha visto sus planes. Solo cuenta días (nada de qué plan miró ni cuánto estuvo) y no
-- lleva datos personales: el estudio y el día de Madrid.
--
-- Solo servidor: RLS activa, la restrictiva `exige_doble_factor` y sin grants a anon/authenticated.
create table if not exists public.billing_visitas_planes (
  studio_id text not null references public.studios(id) on delete cascade,
  dia date not null,
  visitas integer not null default 1,
  primary key (studio_id, dia)
);
alter table public.billing_visitas_planes enable row level security;
create policy exige_doble_factor on public.billing_visitas_planes as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
revoke all on public.billing_visitas_planes from anon, authenticated;
grant all on public.billing_visitas_planes to service_role;
comment on table public.billing_visitas_planes is
  'Días en que la propietaria de un estudio que aún no paga ha visto la pantalla de elegir plan. Una fila por estudio y día de Madrid. Alimenta una alerta de /interno. Solo servidor.';

-- Suma una visita al día de HOY de Madrid, sin carreras (un upsert).
create or replace function public.registrar_visita_planes(p_studio_id text)
returns void
language sql
set search_path = public, pg_temp
as $$
  insert into public.billing_visitas_planes as v (studio_id, dia)
  values (p_studio_id, public.hoy_estudio())
  on conflict (studio_id, dia) do update set visitas = v.visitas + 1;
$$;

-- ⚠️ pg_default_acl da EXECUTE a anon/authenticated DIRECTO: los tres pasos.
revoke execute on function public.registrar_visita_planes(text) from public, anon, authenticated;
grant execute on function public.registrar_visita_planes(text) to service_role;
