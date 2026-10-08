-- Quién recibe la visita guiada lo decide el fundador desde /interno (pedido del 8-oct-2026):
-- activar o desactivar por estudio, en todos, y si los estudios NUEVOS la llevan de serie.
--
-- · `ajustes_plataforma`: ajustes de PLATAFORMA (no de un estudio), clave → jsonb. Solo la
--   toca el servidor (service-role) desde /interno: RLS sin ninguna política permisiva y sin
--   permisos para anon/authenticated. Lleva la restrictiva `exige_doble_factor` como toda
--   tabla con RLS (supabase/tests/rls-doble-factor.test.ts).
-- · `visita_guiada_estudios_nuevos` = {"activa": bool}. Nace APAGADA: nadie la recibe hasta que
--   el fundador la enciende.
-- · `marcar_tour_obligatorio()` (trigger BEFORE INSERT de studios) ahora LEE ese ajuste, en vez
--   de llevarlo cableado. SECURITY DEFINER para poder leer la tabla cuando inserta una
--   propietaria con su sesión (que no tiene permiso sobre ella). Sigue sin fiarse del cliente:
--   ignora lo que venga en el payload. Sedes de cadena, demos y cuentas que no son de estudio
--   quedan fuera, como siempre.

create table if not exists public.ajustes_plataforma (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);

alter table public.ajustes_plataforma enable row level security;
revoke all on table public.ajustes_plataforma from anon, authenticated;

create policy exige_doble_factor on public.ajustes_plataforma as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

insert into public.ajustes_plataforma (clave, valor)
values ('visita_guiada_estudios_nuevos', '{"activa": false}'::jsonb)
on conflict (clave) do nothing;

create or replace function public.marcar_tour_obligatorio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nuevos boolean;
begin
  select coalesce((valor->>'activa')::boolean, false) into nuevos
    from public.ajustes_plataforma where clave = 'visita_guiada_estudios_nuevos';
  new.tour_obligatorio := coalesce(nuevos, false)
    and new.cadena_id is null
    and not coalesce(new.es_demo, false)
    and coalesce(new.tipo_cuenta, 'ESTUDIO') = 'ESTUDIO';
  new.tour_progreso := '{}'::jsonb;
  new.tour_completado_en := null;
  return new;
end
$$;

-- Función de trigger: nadie la llama a mano. Los tres REVOKE explícitos (el default_acl da
-- EXECUTE directo a anon/authenticated; `from public` no basta).
revoke execute on function public.marcar_tour_obligatorio() from public;
revoke execute on function public.marcar_tour_obligatorio() from anon;
revoke execute on function public.marcar_tour_obligatorio() from authenticated;
grant execute on function public.marcar_tour_obligatorio() to service_role;
