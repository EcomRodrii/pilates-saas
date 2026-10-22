-- El lote de apps creadas de antemano (15-oct-2026, docs/APP-IOS.md, «Apps por estudio»).
--
-- Apple no deja crear el registro de una app por API. Por eso se registran por API los
-- identificadores `app.tentare.cupo-NNN`, se crean esas apps de golpe en App Store Connect y,
-- cuando un estudio pide la suya, se le ASIGNA un hueco libre (y se le cambia el nombre por API).
-- Esta tabla es ese lote; `asc_app_id` es el id de la app en App Store Connect.
--
-- ⚠️ Sin clave ajena a `studios` a propósito: un estudio borrado no debe liberar su hueco (la app
-- de la tienda sigue llamándose como él); `studio_id` queda como rastro. UNIQUE: un hueco por estudio.
-- Solo el servidor (service_role), como `apps_estudio`.

create table if not exists public.apps_estudio_cupos (
  bundle_id   text primary key,
  asc_app_id  text not null unique,
  studio_id   text unique,
  asignado_en timestamptz,
  creado_en   timestamptz not null default now(),
  -- Cada restricción en UNA línea (scripts/gen-db-types.py lee el cuerpo línea a línea).
  constraint apps_estudio_cupos_bundle check (bundle_id ~ '^app\.tentare\.cupo-[0-9]{3}$'),
  constraint apps_estudio_cupos_asc check (asc_app_id ~ '^[0-9]{6,15}$')
);

alter table public.apps_estudio_cupos enable row level security;
revoke all on table public.apps_estudio_cupos from anon, authenticated;

create policy exige_doble_factor on public.apps_estudio_cupos as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- El primer lote: creadas en App Store Connect el 15-oct-2026 («Tentare cupo 001…010»).
insert into public.apps_estudio_cupos (bundle_id, asc_app_id) values
  ('app.tentare.cupo-001', '6823157562'), ('app.tentare.cupo-002', '6823157806'),
  ('app.tentare.cupo-003', '6823159594'), ('app.tentare.cupo-004', '6823161475'),
  ('app.tentare.cupo-005', '6823161638'), ('app.tentare.cupo-006', '6823161940'),
  ('app.tentare.cupo-007', '6823162372'), ('app.tentare.cupo-008', '6823162415'),
  ('app.tentare.cupo-009', '6823162679'), ('app.tentare.cupo-010', '6823163422')
on conflict (bundle_id) do nothing;

-- Asigna un hueco libre a un estudio, o devuelve el que ya tiene. `null` si no queda ninguno.
-- El candado (`for update skip locked`) evita que dos peticiones a la vez se lleven el mismo hueco;
-- si el mismo estudio pide dos veces a la vez, la UNIQUE de `studio_id` rechaza la segunda.
create or replace function public.asignar_cupo_app(p_studio_id text) returns text
language plpgsql security definer set search_path = public as $$
declare v_bundle text;
begin
  select c.bundle_id into v_bundle from public.apps_estudio_cupos c where c.studio_id = p_studio_id;
  if v_bundle is not null then return v_bundle; end if;
  select c.bundle_id into v_bundle from public.apps_estudio_cupos c
   where c.studio_id is null order by c.bundle_id limit 1 for update skip locked;
  if v_bundle is null then return null; end if;
  update public.apps_estudio_cupos set studio_id = p_studio_id, asignado_en = now() where bundle_id = v_bundle;
  return v_bundle;
end $$;

-- ⚠️ El default ACL da EXECUTE directo a anon/authenticated en toda SECURITY DEFINER nueva:
-- revocar PUBLIC no basta (tentare-os). Solo service_role.
revoke all on function public.asignar_cupo_app(text) from public;
revoke all on function public.asignar_cupo_app(text) from anon;
revoke all on function public.asignar_cupo_app(text) from authenticated;
grant execute on function public.asignar_cupo_app(text) to service_role;
